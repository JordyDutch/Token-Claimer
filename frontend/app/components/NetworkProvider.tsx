"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { NetworkId, NetworkConfig, NETWORKS } from "../lib/networks";

interface NetworkState {
  networkId: NetworkId;
  config: NetworkConfig;
  setNetwork: (id: NetworkId) => void;
}

const NetworkContext = createContext<NetworkState>({
  networkId: "mainnet",
  config: NETWORKS.mainnet,
  setNetwork: () => {},
});

export function useNetwork() {
  return useContext(NetworkContext);
}

export default function NetworkProvider({ children }: { children: ReactNode }) {
  const [networkId, setNetworkIdState] = useState<NetworkId>("mainnet");

  // Restore from localStorage on mount (client-only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lukso_network");
      if (saved === "testnet") setNetworkIdState("testnet");
    } catch {}
  }, []);

  const setNetwork = useCallback((id: NetworkId) => {
    setNetworkIdState(id);
    try {
      localStorage.setItem("lukso_network", id);
    } catch {}
  }, []);

  return (
    <NetworkContext.Provider
      value={{ networkId, config: NETWORKS[networkId], setNetwork }}
    >
      {children}
    </NetworkContext.Provider>
  );
}
