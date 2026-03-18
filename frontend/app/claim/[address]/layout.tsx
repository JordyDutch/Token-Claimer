import type { Metadata } from "next";
import type { ReactNode } from "react";

const MAINNET_RPC = "https://rpc.mainnet.lukso.network";

const LSP4_TOKEN_NAME_KEY =
  "0xdeba1e292f8ba88238e10ab3c7f88bd4be4fac56cad5194b6ecceaf653468af1";
const LSP4_METADATA_KEY =
  "0x9afb95cacc9f95858ec44aa8c3b685511002e30ae54415823f406128b85b238e";

function hexToUtf8(hex: string): string {
  if (!hex || hex === "0x") return "";
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = Buffer.from(clean, "hex");
  return bytes.toString("utf8");
}

function ipfsToHttp(url: string): string {
  if (!url) return "";
  if (url.startsWith("ipfs://"))
    return `https://cloudflare-ipfs.com/ipfs/${url.slice(7)}`;
  return url;
}

async function ethCall(to: string, data: string): Promise<string> {
  try {
    const res = await fetch(MAINNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
      next: { revalidate: 300 },
    });
    const json = await res.json();
    return json.result ?? "0x";
  } catch {
    return "0x";
  }
}

function encodeGetData(key: string): string {
  const sig = "0x54f6127f";
  const keyClean = key.startsWith("0x") ? key.slice(2) : key;
  return sig + keyClean.padStart(64, "0");
}

function decodeBytes(hex: string): string {
  if (!hex || hex === "0x" || hex.length < 4) return "0x";
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length < 128) return "0x";
  const len = parseInt(clean.slice(64, 128), 16);
  return "0x" + clean.slice(128, 128 + len * 2);
}

async function fetchDropMeta(
  address: string
): Promise<{ name: string; description: string; iconUrl: string | null }> {
  let name = "Token Drop";
  let description = "Claim exclusive token drops on LUKSO";
  let iconUrl: string | null = null;

  try {
    const nameHex = decodeBytes(
      await ethCall(address, encodeGetData(LSP4_TOKEN_NAME_KEY))
    );
    const fetchedName = hexToUtf8(nameHex);
    if (fetchedName) name = fetchedName;

    const metaHex = decodeBytes(
      await ethCall(address, encodeGetData(LSP4_METADATA_KEY))
    );
    if (metaHex && metaHex !== "0x") {
      const clean = metaHex.startsWith("0x") ? metaHex.slice(2) : metaHex;
      if (clean.startsWith("6f357c6a")) {
        const urlHex = clean.slice(8 + 64);
        const ipfsUrl = Buffer.from(urlHex, "hex").toString("utf8");
        const gatewayUrl = ipfsToHttp(ipfsUrl);
        const metaRes = await fetch(gatewayUrl, { next: { revalidate: 3600 } });
        const metaJson = await metaRes.json();
        const meta = metaJson?.LSP4Metadata;
        if (meta?.description) description = meta.description;
        const icons = meta?.icon;
        if (icons && icons.length > 0) iconUrl = ipfsToHttp(icons[0].url);
      }
    }
  } catch {
    // fallback
  }

  return { name, description, iconUrl };
}

export async function generateMetadata({
  params,
}: {
  params: { address: string };
}): Promise<Metadata> {
  const { address } = params;
  const { name, description, iconUrl } = await fetchDropMeta(address);

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://agent-token-claimer.vercel.app");
  const ogImageUrl = `${baseUrl}/claim/${address}/opengraph-image`;

  return {
    title: `${name} | Token Claimer`,
    description,
    openGraph: {
      title: `${name} | Token Claimer`,
      description,
      url: `${baseUrl}/claim/${address}`,
      siteName: "Token Claimer",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: name,
        },
        // fallback: direct icon if available
        ...(iconUrl ? [{ url: iconUrl, width: 200, height: 200, alt: name }] : []),
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} | Token Claimer`,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function ClaimAddressLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
