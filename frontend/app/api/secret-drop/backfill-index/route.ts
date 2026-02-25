import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { SecretDropConfig } from "../../../lib/secret-drop";

// POST /api/secret-drop/backfill-index
// One-time migration: scans all sdrop:* keys and rebuilds creator indexes.
// Safe to run multiple times — deduplicates via Set before writing.
// Support both GET (browser) and POST
export const GET = handler;
export const POST = handler;

async function handler(_req: NextRequest) {
  try {
    let cursor: string = "0";
    const creatorMap = new Map<string, Set<string>>(); // creator → Set<id>
    const publicMap = new Map<string, Set<string>>();  // network → Set<id>

    // SCAN for all sdrop config keys (not pool/claimed sub-keys)
    do {
      const [nextCursor, keys]: [string, string[]] = await kv.scan(cursor, {
        match: "sdrop:*",
        count: 200,
      });
      cursor = nextCursor;

      for (const key of keys) {
        // Only match top-level config keys: sdrop:{uuid} (36-char UUID)
        // Skip sub-keys like sdrop:{id}:pool, sdrop:{id}:claimed:*, sdrop:creator:*
        const match = key.match(/^sdrop:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
        if (!match) continue;

        const id = match[1];
        const config = await kv.get<SecretDropConfig>(`sdrop:${id}`);
        if (!config?.creator) continue;

        const creator = config.creator.toLowerCase();
        if (!creatorMap.has(creator)) creatorMap.set(creator, new Set());
        creatorMap.get(creator)!.add(id);

        if (config.isPublic) {
          const net = config.network ?? "mainnet";
          if (!publicMap.has(net)) publicMap.set(net, new Set());
          publicMap.get(net)!.add(id);
        }
      }
    } while (cursor !== "0");

    // Rebuild each creator index (merge with existing to avoid duplicates)
    let totalIndexed = 0;
    for (const [creator, ids] of creatorMap) {
      const existing: string[] = await kv.lrange(`sdrop:creator:${creator}`, 0, -1);
      const existingSet = new Set(existing);
      const toAdd = [...ids].filter((id) => !existingSet.has(id));
      if (toAdd.length > 0) {
        await kv.rpush(`sdrop:creator:${creator}`, ...toAdd);
        totalIndexed += toAdd.length;
      }
    }

    // Rebuild public index per network
    let totalPublicIndexed = 0;
    for (const [net, ids] of publicMap) {
      const existing: string[] = await kv.lrange(`sdrop:public:${net}`, 0, -1);
      const existingSet = new Set(existing);
      const toAdd = [...ids].filter((id) => !existingSet.has(id));
      if (toAdd.length > 0) {
        await kv.rpush(`sdrop:public:${net}`, ...toAdd);
        totalPublicIndexed += toAdd.length;
      }
    }

    return NextResponse.json({
      ok: true,
      creators: creatorMap.size,
      newEntries: totalIndexed,
      newPublicEntries: totalPublicIndexed,
    });
  } catch (err: any) {
    console.error("Backfill error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
