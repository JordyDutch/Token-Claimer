import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { SecretDropConfig } from "../../../../lib/secret-drop";
import {
  verifySig,
  parseManageMessage,
  isFresh,
  normaliseAddress,
} from "../../../../lib/server/verify-claim";

// POST /api/secret-drop/[id]/manage
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { message, signature, updates } = body;

    // 1. Load existing config
    const config = await kv.get<SecretDropConfig>(`sdrop:${id}`);
    if (!config) {
      return NextResponse.json({ error: "Drop not found" }, { status: 404 });
    }

    // 2. Verify message format + freshness
    const parsed = parseManageMessage(message);
    if (!parsed) return NextResponse.json({ error: "Invalid message format" }, { status: 400 });
    if (parsed.dropId !== id) return NextResponse.json({ error: "Drop ID mismatch" }, { status: 400 });
    if (!isFresh(parsed.ts)) return NextResponse.json({ error: "Message expired" }, { status: 400 });

    // 3. Verify signature
    const net = config.network;
    if (!await verifySig(message, signature, parsed.address, net)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 4. Check that signer is creator
    const signer = normaliseAddress(parsed.address);
    if (signer !== config.creator) {
      return NextResponse.json({ error: "Not the creator" }, { status: 403 });
    }

    // 5. Apply allowed updates
    if (typeof updates !== "object" || !updates) {
      return NextResponse.json({ error: "Updates object required" }, { status: 400 });
    }

    if (typeof updates.active === "boolean") config.active = updates.active;
    if (typeof updates.isPublic === "boolean") config.isPublic = updates.isPublic;
    if (typeof updates.image === "string" || updates.image === null) config.image = updates.image || null;
    if (Array.isArray(updates.tokenRequirements)) config.tokenRequirements = updates.tokenRequirements;
    if (updates.followerRequirement !== undefined) config.followerRequirement = updates.followerRequirement ?? null;
    if (typeof updates.minFollowers === "number") config.minFollowers = updates.minFollowers;

    // 6. Save
    await kv.set(`sdrop:${id}`, config);

    // 7. If isPublic toggled on, add to public index (stale entries filtered at read time)
    if (updates.isPublic === true) {
      await kv.rpush(`sdrop:public:${config.network}`, id);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Manage secret drop error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
