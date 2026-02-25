import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { SecretDropConfig, SecretDropSummary } from "../../../lib/secret-drop";

// GET /api/secret-drop/explore?network=mainnet|testnet
export async function GET(req: NextRequest) {
  const network = req.nextUrl.searchParams.get("network") === "testnet" ? "testnet" : "mainnet";

  try {
    const rawIds: string[] = await kv.lrange(`sdrop:public:${network}`, 0, -1);
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
      // Source of truth is config — only return active + isPublic drops
      if (!cfg || !cfg.active || !(cfg.isPublic ?? false)) continue;
      if (cfg.network !== network) continue;

      let remaining: number | null = null;
      if (cfg.mode === "pool") {
        remaining = await kv.llen(`sdrop:${ids[i]}:pool`);
      }

      drops.push({
        id: ids[i],
        title: cfg.title,
        mode: cfg.mode,
        active: cfg.active,
        isPublic: true,
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
  } catch (err: any) {
    console.error("Explore secret drops error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
