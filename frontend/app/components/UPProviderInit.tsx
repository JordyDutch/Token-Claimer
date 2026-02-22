"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { isInIframe, setUPProvider } from "../lib/contracts";

interface UPProviderState {
  /** true once the provider is determined (either UP Provider loaded, or not in iframe) */
  ready: boolean;
  /** true when running inside an iframe */
  inIframe: boolean;
}

const UPProviderContext = createContext<UPProviderState>({ ready: false, inIframe: false });

export function useUPProvider() {
  return useContext(UPProviderContext);
}

/**
 * Initialises @lukso/up-provider when the app runs inside an iframe
 * (e.g. the universaleverything.io grid). Exposes readiness via context
 * so WalletProvider can wait for the provider before setting up listeners.
 */
export default function UPProviderInit({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UPProviderState>({ ready: false, inIframe: false });

  useEffect(() => {
    const iframe = isInIframe();

    if (!iframe) {
      setState({ ready: true, inIframe: false });
      return;
    }

    setState(s => ({ ...s, inIframe: true }));

    import("@lukso/up-provider").then(({ createClientUPProvider }) => {
      const provider = createClientUPProvider();
      setUPProvider(provider);
      setState({ ready: true, inIframe: true });
    });
  }, []);

  return (
    <UPProviderContext.Provider value={state}>
      {children}
    </UPProviderContext.Provider>
  );
}
