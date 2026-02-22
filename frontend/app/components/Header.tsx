"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNetwork } from "./NetworkProvider";

export default function Header() {
  const pathname = usePathname();
  const { networkId, setNetwork } = useNetwork();
  const isTestnet = networkId === "testnet";

  const linkClass = (href: string) => {
    const active = pathname === href;
    return `text-xs sm:text-sm font-medium transition-colors ${
      active ? "text-purple-400" : "text-zinc-500 hover:text-zinc-300"
    }`;
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-lg bg-[#0a0a0f]/80 border-b border-zinc-800/60">
      <div className="max-w-2xl mx-auto flex items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-purple-400 flex items-center justify-center text-xs font-bold text-white">
            TC
          </div>
          <span className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors hidden sm:inline">
            Token Claimer
          </span>
        </Link>

        <nav className="flex items-center gap-3 sm:gap-5">
          <Link href="/" className={linkClass("/")}>
            Explore
          </Link>
          <Link href="/create" className={linkClass("/create")}>
            Create
          </Link>
          <Link href="/my-drops" className={linkClass("/my-drops")}>
            My Drops
          </Link>

          {/* Network toggle */}
          <button
            onClick={() => setNetwork(isTestnet ? "mainnet" : "testnet")}
            title={`Switch to ${isTestnet ? "Mainnet" : "Testnet"}`}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border transition-all cursor-pointer ${
              isTestnet
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                : "bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isTestnet ? "bg-amber-400" : "bg-green-400"
              }`}
            />
            {isTestnet ? "Testnet" : "Mainnet"}
          </button>
        </nav>
      </div>
    </header>
  );
}
