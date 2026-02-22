"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { getProvider, ensureLuksoNetwork } from "../lib/contracts";
import { fetchProfile, ProfileInfo } from "../lib/profile";

interface WalletState {
  address: string | null;
  profile: ProfileInfo | null;
  connecting: boolean;
  connect: () => Promise<string | null>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  address: null,
  profile: null,
  connecting: false,
  connect: async () => null,
  disconnect: () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

export default function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Try to restore connection on mount (silent, no popup)
  useEffect(() => {
    const p = getProvider();
    if (!p) return;
    p.request({ method: "eth_accounts" })
      .then((accounts: string[]) => {
        if (accounts.length > 0) {
          const addr = accounts[0];
          setAddress(addr);
          fetchProfile(addr).then(setProfile).catch(() => {});
        }
      })
      .catch(() => {});

    // Listen for account changes
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        setAddress(null);
        setProfile(null);
      } else {
        const addr = accounts[0];
        setAddress(addr);
        setProfile(null);
        fetchProfile(addr).then(setProfile).catch(() => {});
      }
    };

    if (p.on) {
      p.on("accountsChanged", handleAccountsChanged);
    }

    return () => {
      if (p.removeListener) {
        p.removeListener("accountsChanged", handleAccountsChanged);
      }
    };
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    const p = getProvider();
    if (!p) return null;
    try {
      setConnecting(true);
      await ensureLuksoNetwork();
      const accounts = await p.request({ method: "eth_requestAccounts" });
      const addr = accounts[0];
      setAddress(addr);
      fetchProfile(addr).then(setProfile).catch(() => {});
      return addr;
    } catch {
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setProfile(null);
  }, []);

  return (
    <WalletContext.Provider value={{ address, profile, connecting, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}
