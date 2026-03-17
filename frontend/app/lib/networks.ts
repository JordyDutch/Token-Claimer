export type NetworkId = "mainnet" | "testnet";

export interface NetworkConfig {
  id: NetworkId;
  name: string;
  chainId: number;
  chainIdHex: string;
  rpc: string;
  /** Active factory — used when creating new drops */
  lsp7Factory: string;
  lsp8Factory: string;
  /** All historical factories — queried when listing existing drops */
  allLsp7Factories: string[];
  allLsp8Factories: string[];
  explorerBase: string;
  faucet?: string;
}

// ─── Factory history ──────────────────────────────────────────────────────────
// When redeploying factories, add the old address to allLsp7Factories /
// allLsp8Factories (oldest first) BEFORE updating lsp7Factory / lsp8Factory.
// The frontend queries ALL listed factories so existing drops stay visible.
//
// Mainnet LSP7 factory history:
//   v3  (codeword support)  : 0x9b132E764f92c6E6F5E91E276E310758C33dB08F
//   v4  (multi-creator)     : 0xE618ddD88869E43E433eD103b0d896E1a05d5b40
//   v5  (EIP-1167 proxies)  : 0xE2932677195f46341c9d13dD0BBa016ac19B4E05  ← active
//
// Mainnet LSP8 factory history:
//   v3  (codeword support)  : 0xBd545E98F133282bD79dc4a6ac422437478A58b6
//   v4  (multi-creator)     : 0x9bc9e8D57a94E0F88ab32CDC1865c3fdeF86f72E
//   v5  (constructor pattern, OWASP fixes) : 0x649Ccee0D46283102De6fEef3456c2e0a6c37461  ← active

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  mainnet: {
    id: "mainnet",
    name: "Mainnet",
    chainId: 42,
    chainIdHex: "0x2a",
    rpc:
      process.env.NEXT_PUBLIC_LUKSO_RPC ??
      "https://rpc.mainnet.lukso.network",
    // Active factory — used when creating new drops
    lsp7Factory:
      process.env.NEXT_PUBLIC_LSP7_FACTORY ??
      "0xF1b5FfA5A82Cee28eaC551165102a1e62fBef7Ab",
    lsp8Factory:
      process.env.NEXT_PUBLIC_LSP8_FACTORY ??
      "0xA373f07E94496A4509c30DcB27b431c541b87FbF",
    // All historical factories — queried when listing existing drops
    allLsp7Factories: [
      "0x9b132E764f92c6E6F5E91E276E310758C33dB08F", // v3: codeword support
      "0xE618ddD88869E43E433eD103b0d896E1a05d5b40", // v4: multi-creator
      "0xE2932677195f46341c9d13dD0BBa016ac19B4E05", // v5: EIP-1167 proxies
      process.env.NEXT_PUBLIC_LSP7_FACTORY ?? "0xF1b5FfA5A82Cee28eaC551165102a1e62fBef7Ab", // v6: LSP7-NFT support (active)
    ],
    allLsp8Factories: [
      "0xBd545E98F133282bD79dc4a6ac422437478A58b6", // v3: codeword support
      "0x9bc9e8D57a94E0F88ab32CDC1865c3fdeF86f72E", // v4: multi-creator
      "0x649Ccee0D46283102De6fEef3456c2e0a6c37461", // v5: OWASP fixes
      process.env.NEXT_PUBLIC_LSP8_FACTORY ?? "0xA373f07E94496A4509c30DcB27b431c541b87FbF", // v6: LSP7-NFT compat (active)
    ],
    explorerBase: "https://explorer.execution.mainnet.lukso.network",
  },
  testnet: {
    id: "testnet",
    name: "Testnet",
    chainId: 4201,
    chainIdHex: "0x1069",
    rpc:
      process.env.NEXT_PUBLIC_TESTNET_LUKSO_RPC ??
      "https://rpc.testnet.lukso.network",
    // Active factory — used when creating new drops
    lsp7Factory:
      process.env.NEXT_PUBLIC_TESTNET_LSP7_FACTORY ??
      "0x26AeD9C6f0BAA907f9ec9a5Fd1135C21F4B1aBB0",
    lsp8Factory:
      process.env.NEXT_PUBLIC_TESTNET_LSP8_FACTORY ??
      "0xee28A2464178F4814EA356735e27B5A0e219F47D",
    allLsp7Factories: [
      "0x58877A19286c054acBcE221c7E92ab9039Bf2909", // previous testnet
      process.env.NEXT_PUBLIC_TESTNET_LSP7_FACTORY ?? "0x26AeD9C6f0BAA907f9ec9a5Fd1135C21F4B1aBB0", // v5 (active)
    ],
    allLsp8Factories: [
      "0x6625eDFaca73475dD44b4dAFC8666d92e4d3CAFf", // previous testnet
      process.env.NEXT_PUBLIC_TESTNET_LSP8_FACTORY ?? "0xee28A2464178F4814EA356735e27B5A0e219F47D", // v5 (active)
    ],
    explorerBase: "https://explorer.execution.testnet.lukso.network",
    faucet: "https://faucet.testnet.lukso.network",
  },
};
