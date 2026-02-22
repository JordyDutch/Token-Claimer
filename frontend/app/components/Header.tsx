"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNetwork } from "./NetworkProvider";
import { useTheme } from "./ThemeProvider";

export default function Header() {
  const pathname = usePathname();
  const { networkId, setNetwork } = useNetwork();
  const { theme, toggleTheme } = useTheme();
  const isTestnet = networkId === "testnet";

  const linkClass = (href: string) => {
    const active = pathname === href;
    return `text-xs sm:text-sm font-medium transition-colors ${
      active ? "text-purple-600 dark:text-purple-400" : "text-label hover:text-secondary"
    }`;
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-lg bg-bg-transparent border-b border-border-header">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-purple-400 flex items-center justify-center text-xs font-bold text-white">
            TC
          </div>
          <span className="text-sm font-semibold text-secondary group-hover:text-primary transition-colors hidden sm:inline">
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
          <Link href="/developers" className={linkClass("/developers")}>
            Devs
          </Link>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="w-7 h-7 flex items-center justify-center rounded-full text-label hover:text-secondary transition-colors cursor-pointer"
          >
            {theme === "dark" ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.061l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06l-1.06-1.06a.75.75 0 10-1.061 1.06l1.06 1.06z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.647 1.921a.75.75 0 01.808.083z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          {/* Network toggle */}
          <button
            onClick={() => setNetwork(isTestnet ? "mainnet" : "testnet")}
            title={`Switch to ${isTestnet ? "Mainnet" : "Testnet"}`}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border transition-all cursor-pointer ${
              isTestnet
                ? "bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20"
                : "bg-green-50 dark:bg-green-500/10 border-green-300 dark:border-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/20"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isTestnet ? "bg-amber-500" : "bg-green-500"
              }`}
            />
            {isTestnet ? "Testnet" : "Mainnet"}
          </button>
        </nav>
      </div>
    </header>
  );
}
