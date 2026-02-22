// Shared Envio GraphQL helpers — works for both LUKSO mainnet and testnet

export const ENVIO_MAINNET = "https://envio.lukso-mainnet.universal.tech/v1/graphql";
export const ENVIO_TESTNET = "https://envio.lukso-testnet.universal.tech/v1/graphql";
export const IPFS_GATEWAY = "https://api.universalprofile.cloud/ipfs";

export function getEnvioEndpoint(networkId: "mainnet" | "testnet") {
  return networkId === "testnet" ? ENVIO_TESTNET : ENVIO_MAINNET;
}

export interface AssetInfo {
  id: string;
  lsp4TokenName: string;
  lsp4TokenSymbol: string;
  isLSP7: boolean;
  icon: string | null;
  description: string | null;
}

export async function fetchAssetByAddress(
  address: string,
  endpoint = ENVIO_MAINNET
): Promise<AssetInfo | null> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{ Asset_by_pk(id: "${address.toLowerCase()}") { id lsp4TokenName lsp4TokenSymbol isLSP7 icons { url } description } }`,
      }),
    });
    const json = await res.json();
    const a = json?.data?.Asset_by_pk;
    if (!a) return null;
    return {
      id: a.id,
      lsp4TokenName: a.lsp4TokenName ?? "",
      lsp4TokenSymbol: a.lsp4TokenSymbol ?? "",
      isLSP7: a.isLSP7 ?? true,
      icon: a.icons?.[0]?.url ? `${IPFS_GATEWAY}/${a.icons[0].url.replace("ipfs://", "")}` : null,
      description: a.description ?? null,
    };
  } catch {
    return null;
  }
}

export async function searchAssetsByName(
  query: string,
  limit = 8,
  endpoint = ENVIO_MAINNET
): Promise<AssetInfo[]> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{ Asset(where: {lsp4TokenName: {_ilike: "%${query}%"}}, limit: ${limit}, order_by: {lsp4TokenName: asc}) { id lsp4TokenName lsp4TokenSymbol isLSP7 icons { url } } }`,
      }),
    });
    const json = await res.json();
    return (json?.data?.Asset ?? []).map((a: any) => ({
      id: a.id,
      lsp4TokenName: a.lsp4TokenName ?? "",
      lsp4TokenSymbol: a.lsp4TokenSymbol ?? "",
      isLSP7: a.isLSP7 ?? true,
      icon: a.icons?.[0]?.url ? `${IPFS_GATEWAY}/${a.icons[0].url.replace("ipfs://", "")}` : null,
      description: null,
    }));
  } catch {
    return [];
  }
}
