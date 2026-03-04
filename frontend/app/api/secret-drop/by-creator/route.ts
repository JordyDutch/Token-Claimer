import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { SecretDropConfig, SecretDropSummary } from "../../../lib/secret-drop";

// GET /api/secret-drop/by-creator?address=0x...&network=mainnet|testnet
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  const network = req.nextUrl.searchParams.get("network") === "testnet" ? "testnet" : "mainnet";

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  // Read creator index
  const key = `sdrop:creator:${address}`;
  console.log("[by-creator] looking up:", key, "network:", network);
  const rawIds: string[] = await kv.lrange(key, 0, -1);
  console.log("[by-creator] rawIds:", rawIds);
  if (!rawIds || rawIds.length === 0) {
    return NextResponse.json({ drops: [] });
  }

  // Deduplicate
  const ids = [...new Set(rawIds)];

  // Batch-fetch configs
  const keys = ids.map((id) => `sdrop:${id}`);
  const configs = await kv.mget<(SecretDropConfig | null)[]>(...keys);

  const drops: SecretDropSummary[] = [];
  for (let i = 0; i < ids.length; i++) {
    const cfg = configs[i];
    if (!cfg || cfg.network !== network) continue;

    let remaining: number | null = null;
    if (cfg.mode === "pool") {
      remaining = await kv.llen(`sdrop:${ids[i]}:pool`);
    }

    drops.push({
      id: ids[i],
      title: cfg.title,
      mode: cfg.mode,
      active: cfg.active,
      isPublic: cfg.isPublic ?? false,
      creator: cfg.creator,
      image: cfg.image ?? null,
      network: cfg.network,
      createdAt: cfg.createdAt,
      totalCodes: cfg.totalCodes,
      remaining,
    });
  }

  // Sort newest first
  drops.sort((a, b) => b.createdAt - a.createdAt);

  return NextResponse.json({ drops });
}
