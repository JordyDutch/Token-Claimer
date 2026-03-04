import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { JsonRpcProvider, Contract } from "ethers";
import {
  verifySig,
  parseVisibilityMessage,
  isFresh,
  normaliseAddress,
} from "../../lib/server/verify-claim";

const OWNER_ABI = ["function owner() view returns (address)"];
const MAINNET_RPC = "https://rpc.mainnet.lukso.network";
const TESTNET_RPC = "https://rpc.testnet.lukso.network";

// GET /api/drop-visibility?network=mainnet|testnet
// Returns { hidden: string[] } — list of contract addresses hidden from Explore
export async function GET(req: NextRequest) {
  const network = req.nextUrl.searchParams.get("network") === "testnet" ? "testnet" : "mainnet";

  try {
    const hidden: string[] = await kv.smembers(`drop:hidden:${network}`);
    return NextResponse.json({ hidden: hidden ?? [] });
  } catch (err: any) {
    console.error("Get drop visibility error:", err);
    return NextResponse.json({ hidden: [] });
  }
}

// POST /api/drop-visibility
// Body: { contractAddress, message, signature, visible, network }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, signature, visible, network: rawNetwork } = body;
    const network = rawNetwork === "testnet" ? "testnet" as const : "mainnet" as const;

    // 1. Parse & verify message
    const parsed = parseVisibilityMessage(message);
    if (!parsed) return NextResponse.json({ error: "Invalid message format" }, { status: 400 });
    if (!isFresh(parsed.ts)) return NextResponse.json({ error: "Message expired" }, { status: 400 });

    // 2. Verify signature
    if (!await verifySig(message, signature, parsed.address, network)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const signer = normaliseAddress(parsed.address);
    const contractAddr = normaliseAddress(parsed.contractAddress);

    // 3. Verify on-chain ownership
    const rpc = new JsonRpcProvider(network === "testnet" ? TESTNET_RPC : MAINNET_RPC);
    const contract = new Contract(contractAddr, OWNER_ABI, rpc);
    const owner = await contract.owner();
    if (owner.toLowerCase() !== signer) {
      return NextResponse.json({ error: "Not the owner" }, { status: 403 });
    }

    // 4. Toggle visibility
    const key = `drop:hidden:${network}`;
    if (visible === false) {
      await kv.sadd(key, contractAddr);
    } else {
      await kv.srem(key, contractAddr);
    }

    return NextResponse.json({ ok: true, visible: visible !== false });
  } catch (err: any) {
    console.error("Toggle visibility error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
