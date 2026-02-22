export const LUKSO_RPC =
  process.env.NEXT_PUBLIC_LUKSO_RPC ?? "https://rpc.mainnet.lukso.network";
export const LUKSO_CHAIN_ID = "0x2a";
export const ZERO = "0x0000000000000000000000000000000000000000";

export const LSP7_FACTORY =
  process.env.NEXT_PUBLIC_LSP7_FACTORY ?? "0x65Ae23D3A7a4fBFE5D296A4fE6A8df4662300845";
export const LSP8_FACTORY =
  process.env.NEXT_PUBLIC_LSP8_FACTORY ?? "0x0A6f9751FAb9D366890531489a15d2B9a29a2Dc2";

export const FACTORY_ABI = [
  "function createTokenDrop(string,string,uint256,uint256,bool) returns (address)",
  "function createNFTDrop(string,string,uint256,uint256) returns (address)",
  "function totalCampaigns() view returns (uint256)",
  "function getCampaigns(uint256,uint256) view returns (tuple(address contractAddr, address creator, string name, string symbol, uint256 createdAt)[])",
  "function getCampaignsByCreator(address) view returns (uint256[])",
];

export const CLAIM_ABI = [
  "function claim() external",
  "function owner() view returns (address)",
  "function claimEnabled() view returns (bool)",
  "function startTime() view returns (uint256)",
  "function endTime() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function isClaimActive() view returns (bool)",
  "function hasClaimed(address) view returns (bool)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function amountPerClaim() view returns (uint256)",
  "function requiredToken() view returns (address)",
  "function requiredTokenAmount() view returns (uint256)",
  "function requiredFollowers() view returns (uint256)",
  "function meetsRequirements(address) view returns (bool tokenOk, bool followersOk)",
  "function batchMeetsRequirements(address[]) view returns (bool[] tokenOk, bool[] followersOk)",
  "function setClaimEnabled(bool)",
  "function setClaimWindow(uint256,uint256)",
  "function setAmountPerClaim(uint256)",
  "function setRequirements(address,uint256,uint256)",
];

export const LSP7_EXTRA_ABI = [
  "function totalClaimedAmount() view returns (uint256)",
  "function totalClaimers() view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export const LSP8_EXTRA_ABI = [
  "function totalClaimed() view returns (uint256)",
];

export function getProvider() {
  if (typeof window === "undefined") return null;
  return (window as any).lukso || (window as any).ethereum || null;
}

export async function ensureLuksoNetwork() {
  const p = getProvider();
  if (!p) return;
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: LUKSO_CHAIN_ID }] });
  } catch (e: any) {
    if (e.code === 4902) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: LUKSO_CHAIN_ID,
          chainName: "LUKSO",
          nativeCurrency: { name: "LYX", symbol: "LYX", decimals: 18 },
          rpcUrls: [LUKSO_RPC],
          blockExplorerUrls: ["https://explorer.execution.mainnet.lukso.network"],
        }],
      });
    }
  }
}

// Detect if a claim contract is LSP7 or LSP8 by checking for decimals()
export async function detectTokenType(contract: any): Promise<"LSP7" | "LSP8"> {
  try {
    await contract.decimals();
    return "LSP7";
  } catch {
    return "LSP8";
  }
}
