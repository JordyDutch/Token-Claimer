"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { getProvider, ensureLuksoNetwork, isInIframe } from "../lib/contracts";
import { fetchProfile, ProfileInfo } from "../lib/profile";
import { useNetwork } from "./NetworkProvider";
import { useUPProvider } from "./UPProviderInit";

export type WalletConnectError = "rejected" | "not_installed" | "unknown";

interface WalletState {
  address: string | null;
  /** The profile being viewed on universaleverything.io (contextAccounts[0]) */
  contextAddress: string | null;
  profile: ProfileInfo | null;
  connecting: boolean;
  connect: () => Promise<{ address: string; error: null } | { address: null; error: WalletConnectError }>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  address: null,
  contextAddress: null,
  profile: null,
  connecting: false,
  connect: async () => ({ address: null, error: "unknown" }),
  disconnect: () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

export default function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [contextAddress, setContextAddress] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const { config: networkConfig } = useNetwork();
  const { ready: upReady, inIframe } = useUPProvider();

  // ─── iframe / UP Provider flow ───
  useEffect(() => {
    if (!upReady || !inIframe) return;

    const p = getProvider();
    if (!p) return;

    const handleAccountsChanged = (accounts: `0x${string}`[]) => {
      if (!accounts || accounts.length === 0) {
        setAddress(null);
        setProfile(null);
      } else {
        const addr = accounts[0] as string;
        setAddress(addr);
        setProfile(null);
        fetchProfile(addr).then(setProfile).catch(() => {});
      }
    };

    const handleContextChanged = (ctx: `0x${string}`[]) => {
      setContextAddress(ctx?.length > 0 ? (ctx[0] as string) : null);
    };

    // Listen for events from the parent (universaleverything.io grid)
    p.on("accountsChanged", handleAccountsChanged);
    p.on("contextAccountsChanged", handleContextChanged);

    // The initialized event fires when the parent connection is established.
    // At that point p.accounts / p.contextAccounts are populated.
    const handleInit = () => {
      const accounts: string[] = p.accounts ?? [];
      if (accounts.length > 0) {
        const addr = accounts[0];
        setAddress(addr);
        fetchProfile(addr).then(setProfile).catch(() => {});
      }
      const ctx: string[] = p.contextAccounts ?? [];
      if (ctx.length > 0) {
        setContextAddress(ctx[0]);
      }
    };
    p.on("initialized", handleInit);

    // Accounts may already be available if connection was fast
    if (p.accounts?.length > 0) {
      handleInit();
    }

    return () => {
      p.removeListener("accountsChanged", handleAccountsChanged);
      p.removeListener("contextAccountsChanged", handleContextChanged);
      p.removeListener("initialized", handleInit);
    };
  }, [upReady, inIframe]);

  // ─── Standalone (browser extension) flow ───
  useEffect(() => {
    if (!upReady || inIframe) return;

    const p = getProvider();
    if (!p) return;

    // Silent restore
    p.request({ method: "eth_accounts" })
      .then((accounts: string[]) => {
        if (accounts.length > 0) {
          const addr = accounts[0];
          setAddress(addr);
          fetchProfile(addr).then(setProfile).catch(() => {});
        }
      })
      .catch(() => {});

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
  }, [upReady, inIframe]);

  const connect = useCallback(async (): Promise<{ address: string; error: null } | { address: null; error: WalletConnectError }> => {
    // Check for UP extension before trying (standalone only)
    if (!isInIframe() && typeof window !== "undefined" && !(window as any).lukso) {
      return { address: null, error: "not_installed" };
    }

    const p = getProvider();
    if (!p) return { address: null, error: "not_installed" };

    try {
      setConnecting(true);

      if (isInIframe()) {
        // In iframe, accounts come from parent — request them via EIP-1193
        const accounts = await p.request({ method: "eth_requestAccounts" });
        if (accounts?.length > 0) {
          const addr = accounts[0];
          setAddress(addr);
          fetchProfile(addr).then(setProfile).catch(() => {});
          return { address: addr, error: null };
        }
        return { address: null, error: "unknown" };
      }

      // Standalone: switch network then request accounts
      await ensureLuksoNetwork(networkConfig);
      const accounts = await p.request({ method: "eth_requestAccounts" });
      const addr = accounts[0];
      setAddress(addr);
      fetchProfile(addr).then(setProfile).catch(() => {});
      return { address: addr, error: null };
    } catch (e: any) {
      // EIP-1193 rejection: code 4001 or ethers ACTION_REJECTED
      if (e?.code === 4001 || e?.code === "ACTION_REJECTED" || e?.message?.toLowerCase().includes("user rejected")) {
        return { address: null, error: "rejected" };
      }
      return { address: null, error: "unknown" };
    } finally {
      setConnecting(false);
    }
  }, [networkConfig]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setProfile(null);
  }, []);

  return (
    <WalletContext.Provider value={{ address, contextAddress, profile, connecting, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}
