import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { SecretDropConfig } from "../../../lib/secret-drop";

// GET /api/secret-drop/[id] — returns public config (no codes, no claimed addresses)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const config = await kv.get<SecretDropConfig>(`sdrop:${id}`);
  if (!config) {
    return NextResponse.json({ error: "Drop not found" }, { status: 404 });
  }

  // Count remaining codes
  let remaining: number | null = null;
  if (config.mode === "pool") {
    remaining = await kv.llen(`sdrop:${id}:pool`);
  }

  const { ...pub } = config;
  return NextResponse.json({ ...pub, remaining });
}
