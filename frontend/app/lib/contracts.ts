// Legacy static constants — prefer useNetwork().config.* for new code
export const LUKSO_RPC =
  process.env.NEXT_PUBLIC_LUKSO_RPC ?? "https://rpc.mainnet.lukso.network";
export const LUKSO_CHAIN_ID = "0x2a";
export const ZERO = "0x0000000000000000000000000000000000000000";

export const LSP7_FACTORY =
  process.env.NEXT_PUBLIC_LSP7_FACTORY ?? "0x9b132E764f92c6E6F5E91E276E310758C33dB08F";
export const LSP8_FACTORY =
  process.env.NEXT_PUBLIC_LSP8_FACTORY ?? "0xBd545E98F133282bD79dc4a6ac422437478A58b6";

// LSP7DropFactory ABI
export const LSP7_FACTORY_ABI = [
  "function createTokenDrop(string,string,uint256,uint256,bool) returns (address)",
  "function totalCampaigns() view returns (uint256)",
  "function getCampaigns(uint256,uint256) view returns (tuple(address contractAddr, address creator, string name, string symbol, uint256 createdAt)[])",
  "function getCampaignsByCreator(address) view returns (uint256[])",
];

// LSP8DropFactory ABI
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

/** Detect if the app is running inside an iframe */
export function isInIframe(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin iframes throw on access
  }
}

let _upProvider: any = null;

/**
 * Returns the EIP-1193 provider.
 * - Inside an iframe (e.g. universaleverything.io grid): uses @lukso/up-provider
 * - Standalone: uses window.lukso or window.ethereum (browser extension)
 */
export function getProvider() {
  if (typeof window === "undefined") return null;

  if (isInIframe()) {
    return _upProvider; // set by UPProviderInit, null if not yet ready
  }

  return (window as any).lukso || (window as any).ethereum || null;
}

/** Called once at app startup to set the UP Provider singleton when in iframe */
export function setUPProvider(provider: any) {
  _upProvider = provider;
}

/** Switch the wallet to a specific LUKSO network. Pass a NetworkConfig for testnet support. */
export async function ensureLuksoNetwork(
  config?: { chainIdHex: string; rpc: string; explorerBase: string; name: string }
) {
  // In iframe context, the parent controls the network — skip switching
  if (isInIframe()) return;

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

// Detect if a claim contract is LSP7 or LSP8 by checking for decimals()
export async function detectTokenType(contract: any): Promise<"LSP7" | "LSP8"> {
  try {
    await contract.decimals();
    return "LSP7";
  } catch {
    return "LSP8";
  }
}
