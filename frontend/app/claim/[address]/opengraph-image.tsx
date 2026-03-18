import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Token Claimer Drop";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MAINNET_RPC = "https://rpc.mainnet.lukso.network";
const LSP4_TOKEN_NAME_KEY =
  "0xdeba1e292f8ba88238e10ab3c7f88bd4be4fac56cad5194b6ecceaf653468af1";
const LSP4_METADATA_KEY =
  "0x9afb95cacc9f95858ec44aa8c3b685511002e30ae54415823f406128b85b238e";

function hexToUtf8(hex: string): string {
  if (!hex || hex === "0x") return "";
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  return new TextDecoder().decode(bytes);
}

function ipfsToHttp(url: string): string {
  if (!url) return "";
  if (url.startsWith("ipfs://")) return `https://api.universalprofile.cloud/ipfs/${url.slice(7)}`;
  return url;
}

async function ethCall(rpc: string, to: string, data: string): Promise<string> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const json = await res.json();
  return json.result ?? "0x";
}

// encode getData(bytes32) call
function encodeGetData(key: string): string {
  const sig = "0x54f6127f"; // getData(bytes32)
  const keyClean = key.startsWith("0x") ? key.slice(2) : key;
  return sig + keyClean.padStart(64, "0");
}

// decode bytes return: skip offset (32) + length (32) = first 64 bytes of data
function decodeBytes(hex: string): string {
  if (!hex || hex === "0x" || hex.length < 4) return "0x";
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length < 128) return "0x";
  const len = parseInt(clean.slice(64, 128), 16);
  return "0x" + clean.slice(128, 128 + len * 2);
}

export default async function OgImage({ params }: { params: { address: string } }) {
  const address = params.address;
  let name = "Token Drop";
  let iconUrl: string | null = null;

  try {
    // Fetch token name
    const nameHex = decodeBytes(await ethCall(MAINNET_RPC, address, encodeGetData(LSP4_TOKEN_NAME_KEY)));
    const fetchedName = hexToUtf8(nameHex);
    if (fetchedName) name = fetchedName;

    // Fetch LSP4Metadata for icon
    const metaHex = decodeBytes(await ethCall(MAINNET_RPC, address, encodeGetData(LSP4_METADATA_KEY)));
    if (metaHex && metaHex !== "0x") {
      // VerifiableURI: 0x6f357c6a + hash(32 bytes) + utf8 url
      const clean = metaHex.startsWith("0x") ? metaHex.slice(2) : metaHex;
      if (clean.startsWith("6f357c6a")) {
        // skip method (4 bytes = 8 hex) + hash (32 bytes = 64 hex)
        const urlHex = clean.slice(8 + 64);
        const ipfsUrl = new TextDecoder().decode(
          new Uint8Array(urlHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)))
        );
        const gatewayUrl = ipfsToHttp(ipfsUrl);
        const metaRes = await fetch(gatewayUrl, { next: { revalidate: 3600 } });
        const metaJson = await metaRes.json();
        const icons = metaJson?.LSP4Metadata?.icon;
        if (icons && icons.length > 0) {
          iconUrl = ipfsToHttp(icons[0].url);
        }
      }
    }
  } catch {
    // fallback to generic
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "linear-gradient(135deg, #0f0f0f 0%, #1a0a2e 50%, #0f0f0f 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Pink accent blob */}
        <div
          style={{
            position: "absolute",
            top: "80px",
            left: "80px",
            width: "200px",
            height: "200px",
            background: "radial-gradient(circle, rgba(236,72,153,0.3) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "32px",
            zIndex: 1,
          }}
        >
          {/* Icon */}
          {iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={iconUrl}
              width={160}
              height={160}
              style={{ borderRadius: "50%", border: "4px solid #ec4899", objectFit: "cover" }}
              alt=""
            />
          ) : (
            <div
              style={{
                width: "160px",
                height: "160px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #ec4899, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "72px",
              }}
            >
              🎁
            </div>
          )}

          {/* Name */}
          <div
            style={{
              fontSize: name.length > 20 ? "52px" : "64px",
              fontWeight: "bold",
              color: "white",
              textAlign: "center",
              maxWidth: "900px",
              lineHeight: 1.1,
            }}
          >
            {name}
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: "28px",
              color: "#ec4899",
              fontWeight: "600",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Claim on LUKSO
          </div>
        </div>

        {/* Bottom branding */}
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            right: "48px",
            fontSize: "20px",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          token-claimer.xyz
        </div>
      </div>
    ),
    { ...size }
  );
}
