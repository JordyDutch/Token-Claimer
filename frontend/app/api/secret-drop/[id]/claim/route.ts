import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { SecretDropConfig, ClaimRecord } from "../../../../lib/secret-drop";
import {
  verifySig,
  parseClaimMessage,
  isFresh,
  normaliseAddress,
  checkOnChainRequirements,
} from "../../../../lib/server/verify-claim";

// POST /api/secret-drop/[id]/claim
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await req.json();
    const { message, signature } = body;

    if (!message || !signature) {
      return NextResponse.json({ error: "message and signature required" }, { status: 400 });
    }

    // 1. Parse & verify signature
    const parsed = parseClaimMessage(message);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid message format" }, { status: 400 });
    }
    if (parsed.dropId !== id) {
      return NextResponse.json({ error: "Drop ID mismatch" }, { status: 400 });
    }
    if (!isFresh(parsed.ts)) {
      return NextResponse.json({ error: "Signature expired — please try again" }, { status: 400 });
    }

    // 2. Load drop config (need network for EIP-1271 sig verification)
    const config = await kv.get<SecretDropConfig>(`sdrop:${id}`);
    if (!config) {
      return NextResponse.json({ error: "Drop not found" }, { status: 404 });
    }
    if (!config.active) {
      return NextResponse.json({ error: "This drop is no longer active" }, { status: 410 });
    }

    if (!await verifySig(message, signature, parsed.address, config.network)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const address = normaliseAddress(parsed.address);

    // 3. Check if already claimed
    const existing = await kv.get<ClaimRecord>(`sdrop:${id}:claimed:${address}`);
    if (existing) {
      // Return their code again (idempotent)
      return NextResponse.json({ code: existing.code, alreadyClaimed: true });
    }

    // 4. On-chain requirements check (server-side, uses LUKSO RPC)
    const { ok, reason } = await checkOnChainRequirements(
      parsed.address, // use original case for eth calls
      config.tokenRequirements,
      config.followerRequirement,
      config.minFollowers,
      config.network
    );
    if (!ok) {
      return NextResponse.json({ error: reason ?? "Requirements not met" }, { status: 403 });
    }

    // 5. Assign a code
    let code: string | null = null;

    if (config.mode === "pool") {
      // LPOP is atomic — safe under concurrency
      code = await kv.lpop<string>(`sdrop:${id}:pool`);
      if (!code) {
        return NextResponse.json({ error: "All codes have been claimed" }, { status: 410 });
      }
    } else {
      // Shared mode: pick a code that hasn't hit its usage limit
      const allCodes = await kv.lrange<string>(`sdrop:${id}:pool`, 0, -1);
      for (const c of allCodes) {
        const key = `sdrop:${id}:code:${Buffer.from(c).toString("base64url")}`;
        const uses = (await kv.get<number>(key)) ?? 0;
        if (uses < config.codeUsageLimit) {
          await kv.incr(key);
          code = c;
          break;
        }
      }
      if (!code) {
        return NextResponse.json({ error: "All codes are fully used" }, { status: 410 });
      }
    }

    // 6. Record the claim atomically
    const record: ClaimRecord = {
      address,
      claimedAt: Math.floor(Date.now() / 1000),
      code,
    };
    await kv.set(`sdrop:${id}:claimed:${address}`, record);

    // 7. Return the code — only visible to this claimer
    return NextResponse.json({ code });
  } catch (err: any) {
    console.error("Claim error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
