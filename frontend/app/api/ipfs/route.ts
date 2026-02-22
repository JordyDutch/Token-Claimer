import { NextRequest, NextResponse } from "next/server";

const PINATA_ENDPOINT = "https://api.pinata.cloud/pinning/pinFileToIPFS";

export async function POST(req: NextRequest) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json(
      { error: "PINATA_JWT not configured on server" },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Forward to Pinata
  const upstream = new FormData();
  upstream.append("file", file, file.name || "upload");

  try {
    const res = await fetch(PINATA_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body: upstream,
    });

    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: json.error?.details || "Pinata upload failed" },
        { status: res.status }
      );
    }

    // Return Pinata response (contains IpfsHash)
    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Upload failed" },
      { status: 500 }
    );
  }
}
