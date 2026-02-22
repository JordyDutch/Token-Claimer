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

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  mainnet: {
    id: "mainnet",
    name: "Mainnet",
    chainId: 42,
    chainIdHex: "0x2a",
    rpc:
      process.env.NEXT_PUBLIC_LUKSO_RPC ??
      "https://rpc.mainnet.lukso.network",
    lsp7Factory:
      process.env.NEXT_PUBLIC_LSP7_FACTORY ??
      "0x9b132E764f92c6E6F5E91E276E310758C33dB08F",
    lsp8Factory:
      process.env.NEXT_PUBLIC_LSP8_FACTORY ??
      "0xBd545E98F133282bD79dc4a6ac422437478A58b6",
    // All LSP7 factories ever deployed on mainnet (oldest → newest)
    allLsp7Factories: [
      "0xE618ddD88869E43E433eD103b0d896E1a05d5b40", // v1 (pre-codeword)
      "0x9b132E764f92c6E6F5E91E276E310758C33dB08F", // v2 (codeword support)
      ...(process.env.NEXT_PUBLIC_LSP7_FACTORY &&
      process.env.NEXT_PUBLIC_LSP7_FACTORY !== "0x9b132E764f92c6E6F5E91E276E310758C33dB08F"
        ? [process.env.NEXT_PUBLIC_LSP7_FACTORY]
        : []),
    ],
    // All LSP8 factories ever deployed on mainnet (oldest → newest)
    allLsp8Factories: [
      "0x9bc9e8D57a94E0F88ab32CDC1865c3fdeF86f72E", // v1 (missing getTokenRequirements)
      "0x3C1958D2C6a5736F87AC4FC08fFEbCAC4312458c", // v2 (with getTokenRequirements)
      "0xBd545E98F133282bD79dc4a6ac422437478A58b6", // v3 (codeword support)
      ...(process.env.NEXT_PUBLIC_LSP8_FACTORY &&
      process.env.NEXT_PUBLIC_LSP8_FACTORY !== "0xBd545E98F133282bD79dc4a6ac422437478A58b6"
        ? [process.env.NEXT_PUBLIC_LSP8_FACTORY]
        : []),
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
    lsp7Factory:
      process.env.NEXT_PUBLIC_TESTNET_LSP7_FACTORY ??
      "0x58877A19286c054acBcE221c7E92ab9039Bf2909",
    lsp8Factory:
      process.env.NEXT_PUBLIC_TESTNET_LSP8_FACTORY ??
      "0x6625eDFaca73475dD44b4dAFC8666d92e4d3CAFf",
    allLsp7Factories: [
      "0x58877A19286c054acBcE221c7E92ab9039Bf2909",
      ...(process.env.NEXT_PUBLIC_TESTNET_LSP7_FACTORY &&
      process.env.NEXT_PUBLIC_TESTNET_LSP7_FACTORY !== "0x58877A19286c054acBcE221c7E92ab9039Bf2909"
        ? [process.env.NEXT_PUBLIC_TESTNET_LSP7_FACTORY]
        : []),
    ],
    allLsp8Factories: [
      "0x6625eDFaca73475dD44b4dAFC8666d92e4d3CAFf",
      ...(process.env.NEXT_PUBLIC_TESTNET_LSP8_FACTORY &&
      process.env.NEXT_PUBLIC_TESTNET_LSP8_FACTORY !== "0x6625eDFaca73475dD44b4dAFC8666d92e4d3CAFf"
        ? [process.env.NEXT_PUBLIC_TESTNET_LSP8_FACTORY]
        : []),
    ],
    explorerBase: "https://explorer.execution.testnet.lukso.network",
    faucet: "https://faucet.testnet.lukso.network",
  },
};
