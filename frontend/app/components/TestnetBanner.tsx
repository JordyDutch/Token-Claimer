"use client";

import { useNetwork } from "./NetworkProvider";

export default function TestnetBanner() {
  const { networkId, config } = useNetwork();
  if (networkId !== "testnet") return null;

  return (
    <div className="w-full bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-center py-1.5 text-xs font-medium">
      Testnet mode — contracts &amp; tokens are for testing only.{" "}
      {config.faucet && (
        <a
          href={config.faucet}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-amber-600 dark:hover:text-amber-300 transition-colors"
        >
          Get testnet LYX
        </a>
      )}
    </div>
  );
}
