// Legacy static constants — prefer useNetwork().config.* for new code
export const LUKSO_RPC =
  process.env.NEXT_PUBLIC_LUKSO_RPC ?? "https://rpc.mainnet.lukso.network";
export const LUKSO_CHAIN_ID = "0x2a";
export const ZERO = "0x0000000000000000000000000000000000000000";

export const LSP7_FACTORY =
  process.env.NEXT_PUBLIC_LSP7_FACTORY ?? "0x9b132E764f92c6E6F5E91E276E310758C33dB08F";
export const LSP8_FACTORY =
  process.env.NEXT_PUBLIC_LSP8_FACTORY ?? "0xBd545E98F133282bD79dc4a6ac422437478A58b6";

// LSP7DropFactory ABI (includes both divisible token and non-divisible NFT creation)
export const LSP7_FACTORY_ABI = [
  "function createTokenDrop(string,string,uint256,uint256,bool) returns (address)",
  "function createNFTDrop(string,string,uint256,uint256) returns (address)",
  "function totalCampaigns() view returns (uint256)",
  "function totalNFTCampaigns() view returns (uint256)",
  "function getCampaigns(uint256,uint256) view returns (tuple(address contractAddr, address creator, string name, string symbol, uint256 createdAt, bool isNonDivisible)[])",
  "function getNFTCampaigns(uint256,uint256) view returns (tuple(address contractAddr, address creator, string name, string symbol, uint256 createdAt, bool isNonDivisible)[])",
  "function getCampaignsByCreator(address) view returns (uint256[])",
  // Legacy aliases for backward compat with old factory deployments
  "function totalTokenCampaigns() view returns (uint256)",
  "function getTokenCampaigns(uint256,uint256) view returns (tuple(address contractAddr, address creator, string name, string symbol, uint256 createdAt)[])",
  "function getTokenCampaignsByCreator(address) view returns (uint256[])",
];

// LSP8DropFactory ABI — kept for backward compat with existing LSP8 campaigns
export const LSP8_FACTORY_ABI = [
  "function createNFTDrop(string,string,uint256,uint256) returns (address)",
  "function totalNFTCampaigns() view returns (uint256)",
  "function getNFTCampaigns(uint256,uint256) view returns (tuple(address contractAddr, address creator, string name, string symbol, uint256 createdAt)[])",
  "function getNFTCampaignsByCreator(address) view returns (uint256[])",
];

// @deprecated — use LSP7_FACTORY_ABI / LSP8_FACTORY_ABI
export const FACTORY_ABI = [...LSP7_FACTORY_ABI, ...LSP8_FACTORY_ABI];

// LSP4 ERC725Y data keys for token name/symbol
// LSP8 and LSP7 (v0.16+) do NOT expose name() / symbol() as view functions.
// Name and symbol are stored in ERC725Y under these keys.
export const LSP4_TOKEN_NAME_KEY =
  "0xdeba1e292f8ba88238e10ab3c7f88bd4be4fac56cad5194b6ecceaf653468af1";
export const LSP4_TOKEN_SYMBOL_KEY =
  "0x2f0a68ab07768e01943a599e73362a0e17a63a72e94dd2e384d2c1d4db932756";

export const CLAIM_ABI = [
  "function claim() external",
  "function owner() view returns (address)",
  "function claimEnabled() view returns (bool)",
  "function startTime() view returns (uint256)",
  "function endTime() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function isClaimActive() view returns (bool)",
  "function hasClaimed(address) view returns (bool)",
  "function getData(bytes32) view returns (bytes)",
  "function amountPerClaim() view returns (uint256)",
  "function getTokenRequirements() view returns (address[] tokens, uint256[] minBalances)",
  "function requiredFollowers() view returns (uint256)",
  "function meetsRequirements(address) view returns (bool tokenOk, bool followersOk)",
  "function batchMeetsRequirements(address[]) view returns (bool[] tokenOk, bool[] followersOk)",
  "function setClaimEnabled(bool)",
  "function setClaimWindow(uint256,uint256)",
  "function setAmountPerClaim(uint256)",
  "function setRequirements(address[],uint256[],uint256)",
  "function claimWithCode(string calldata codeword) external",
  "function setCodeword(string calldata word) external",
  "function codewordEnabled() view returns (bool)",
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

/** Switch the wallet to a specific LUKSO network. Pass a NetworkConfig for testnet support. */
export async function ensureLuksoNetwork(
  config?: { chainIdHex: string; rpc: string; explorerBase: string; name: string }
) {
  const p = getProvider();
  if (!p) return;
  const chainId = config?.chainIdHex ?? LUKSO_CHAIN_ID;
  const rpc = config?.rpc ?? LUKSO_RPC;
  const explorer = config?.explorerBase ?? "https://explorer.execution.mainnet.lukso.network";
  const name = config?.name ?? "LUKSO";
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (e: any) {
    if (e.code === 4902) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId,
          chainName: `LUKSO ${name}`,
          nativeCurrency: { name: "LYX", symbol: "LYX", decimals: 18 },
          rpcUrls: [rpc],
          blockExplorerUrls: [explorer],
        }],
      });
    }
  }
}

// Detect if a claim contract is LSP7, LSP7-NFT (non-divisible), or LSP8
// LSP7 with decimals=0 is treated as an NFT collection in the UI
export async function detectTokenType(contract: any): Promise<"LSP7" | "LSP7-NFT" | "LSP8"> {
  try {
    const decimals = await contract.decimals();
    return Number(decimals) === 0 ? "LSP7-NFT" : "LSP7";
  } catch {
    return "LSP8";
  }
}
