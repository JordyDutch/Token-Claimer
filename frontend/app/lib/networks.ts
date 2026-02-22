export type NetworkId = "mainnet" | "testnet";

export interface NetworkConfig {
  id: NetworkId;
  name: string;
  chainId: number;
  chainIdHex: string;
  rpc: string;
  lsp7Factory: string;
  lsp8Factory: string;
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
    explorerBase: "https://explorer.execution.testnet.lukso.network",
    faucet: "https://faucet.testnet.lukso.network",
  },
};
