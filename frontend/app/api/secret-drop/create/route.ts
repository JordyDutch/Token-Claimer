import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import { SecretDropConfig } from "../../../lib/secret-drop";
import {
  verifySig,
  parseCreateMessage,
  isFresh,
  normaliseAddress,
} from "../../../lib/server/verify-claim";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      message,
      signature,
      title,
      description,
      codes,          // string[] — the actual secret codes/links
      codeUsageLimit, // number (1 = unique per person, N = shared up to N times each)
      network,
      tokenRequirements,
      followerRequirement,
      minFollowers,
      isPublic,
      image,
    } = body;

    // 1. Parse & verify freshness first, then verify signature
    const parsed = parseCreateMessage(message);
    if (!parsed) return NextResponse.json({ error: "Invalid message format" }, { status: 400 });
    if (!isFresh(parsed.ts)) return NextResponse.json({ error: "Message expired" }, { status: 400 });

    const net = network === "testnet" ? "testnet" as const : "mainnet" as const;
    if (!await verifySig(message, signature, parsed.address, net)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const creator = normaliseAddress(parsed.address);

    // 2. Validate input
    if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });
    if (!Array.isArray(codes) || codes.length === 0) {
      return NextResponse.json({ error: "At least one code required" }, { status: 400 });
    }
    const cleanCodes = codes.map((c: string) => String(c).trim()).filter(Boolean);
    if (cleanCodes.length === 0) {
      return NextResponse.json({ error: "No valid codes provided" }, { status: 400 });
    }
    if (cleanCodes.length > 1000) {
      return NextResponse.json({ error: "Max 1000 codes per drop" }, { status: 400 });
    }
    const limit = Math.max(1, Math.min(10000, Number(codeUsageLimit) || 1));

    // 3. Create config (no codes stored here)
    const id = randomUUID();
    const config: SecretDropConfig = {
      id,
      creator,
      title: title.trim(),
      description: (description ?? "").trim(),
      mode: cleanCodes.length === 1 && limit > 1 ? "shared" : "pool",
      codeUsageLimit: limit,
      active: true,
      isPublic: !!isPublic,
      image: typeof image === "string" && image.trim() ? image.trim() : null,
      network: network === "testnet" ? "testnet" : "mainnet",
      tokenRequirements: tokenRequirements ?? [],
      followerRequirement: followerRequirement ?? null,
      minFollowers: Number(minFollowers) || 0,
      createdAt: Math.floor(Date.now() / 1000),
      totalCodes: cleanCodes.length,
    };

    // 4. Store in KV
    await kv.set(`sdrop:${id}`, config);
    await kv.rpush(`sdrop:creator:${creator}`, id);
    if (config.isPublic) {
      await kv.rpush(`sdrop:public:${config.network}`, id);
    }

    if (config.mode === "pool") {
      // Push all codes into a LIST (RPUSH so LPOP gives first-in first-out)
      await kv.rpush(`sdrop:${id}:pool`, ...cleanCodes);
    } else {
      // Shared mode: store the code(s) with usage tracking
      for (const code of cleanCodes) {
        await kv.set(`sdrop:${id}:code:${Buffer.from(code).toString("base64url")}`, 0);
      }
      // Keep an ordered set of codes for lookup
      await kv.rpush(`sdrop:${id}:pool`, ...cleanCodes);
    }

    return NextResponse.json({ id });
  } catch (err: any) {
    console.error("Create secret drop error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
