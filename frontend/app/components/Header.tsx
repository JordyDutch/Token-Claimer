"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useNetwork } from "./NetworkProvider";
import { useTheme } from "./ThemeProvider";
import { useWallet } from "./WalletProvider";

export default function Header() {
  const pathname = usePathname();
  const { networkId, setNetwork } = useNetwork();
  const { theme, toggleTheme } = useTheme();
  const { address, profile, connect, disconnect, connecting } = useWallet();
  const isTestnet = networkId === "testnet";
  const [menuOpen, setMenuOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const walletRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!walletOpen) return;
    const handler = (e: MouseEvent) => {
      if (walletRef.current && !walletRef.current.contains(e.target as Node)) {
        setWalletOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [walletOpen]);

  const navLinks = [
    { href: "/", label: "Explore" },
    { href: "/activity", label: "Activity" },
    { href: "/create", label: "Create" },
    { href: "/my-drops", label: "My Drops" },
    { href: "/developers", label: "Devs" },
  ];

  const linkClass = (href: string) => {
    const active = pathname === href;
    return `text-sm font-medium transition-colors ${
      active ? "text-pink-500 dark:text-pink-400" : "text-label hover:text-secondary"
    }`;
  };

  const mobileLinkClass = (href: string) => {
    const active = pathname === href;
    return `block w-full px-4 py-3 text-sm font-medium transition-colors border-b border-border-header last:border-0 ${
      active
        ? "text-pink-500 dark:text-pink-400 bg-pink-50/50 dark:bg-pink-500/5"
        : "text-secondary hover:bg-surface-2"
    }`;
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-lg bg-bg-transparent border-b border-border-header">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group" onClick={() => setMenuOpen(false)}>
          <svg className="w-7 h-7 flex-shrink-0" viewBox="0 0 166 185" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" clipRule="evenodd" d="M165.276 56.9359C165.276 49.1388 161.116 41.934 154.364 38.0354L93.5499 2.92391C86.7975 -0.974638 78.4782 -0.974635 71.7259 2.92391L10.912 38.0354C4.15963 41.934 4.4275e-06 49.1388 4.4275e-06 56.9359L0 127.159C-6.99566e-07 134.956 4.15964 142.161 10.912 146.059L71.7259 181.171C78.4782 185.069 86.7975 185.069 93.5499 181.171L154.364 146.059C161.116 142.161 165.276 134.956 165.276 127.159V56.9359ZM64.0936 48.4204C59.976 48.4204 56.1712 50.6171 54.1124 54.1831L35.5702 86.2997C33.5114 89.8657 33.5114 94.2592 35.5702 97.8252L54.1124 129.942C56.1712 133.508 59.976 135.705 64.0936 135.705H101.178C105.296 135.705 109.1 133.508 111.159 129.942L129.701 97.8252C131.76 94.2592 131.76 89.8657 129.701 86.2997L111.159 54.1831C109.1 50.6171 105.296 48.4204 101.178 48.4204H64.0936Z" fill="#FA2F79"/>
          </svg>
          <span className="text-sm font-semibold text-secondary group-hover:text-primary transition-colors hidden sm:inline">
            Token Claimer
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-5">
          {navLinks.map(({ href, label }) => (
            <Link key={href} href={href} className={linkClass(href)}>
              {label}
            </Link>
          ))}
        </nav>

        {/* Desktop right controls */}
        <div className="hidden md:flex items-center gap-3">
          {/* Wallet */}
          {address ? (
            <div className="relative" ref={walletRef}>
              <button
                onClick={() => setWalletOpen(!walletOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full hover:bg-surface-2 transition-colors cursor-pointer"
              >
                {profile?.image ? (
                  <img src={profile.image} alt={profile.name || "wallet"} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-pink-500/20 flex items-center justify-center text-[9px] text-pink-500 flex-shrink-0">
                    {address.slice(2, 4).toUpperCase()}
                  </span>
                )}
                <span className="text-xs text-secondary max-w-[100px] truncate">
                  {profile?.name || `${address.slice(0, 6)}…${address.slice(-4)}`}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3 h-3 text-faint transition-transform ${walletOpen ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </button>
              {walletOpen && (
                <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-border-header bg-bg shadow-lg overflow-hidden z-50">
                  <div className="px-3 py-2 border-b border-border-header">
                    <p className="text-[10px] text-faint font-mono truncate">{address.slice(0, 10)}…{address.slice(-6)}</p>
                  </div>
                  <button
                    onClick={() => { disconnect(); setWalletOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-500/5 transition-colors cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={connecting}
              className="text-xs font-medium px-2.5 py-1 rounded-full border border-pink-500/50 text-pink-500 hover:bg-pink-500/10 transition-all cursor-pointer disabled:opacity-50"
            >
              {connecting ? "…" : "Connect"}
            </button>
          )}

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

          {/* Network badge */}
          <button
            onClick={() => {
              if (pathname.startsWith("/create") || pathname.startsWith("/manage/")) {
                if (!window.confirm("Switching networks will reset your form. Continue?")) return;
              }
              setNetwork(isTestnet ? "mainnet" : "testnet");
            }}
            title={`Switch to ${isTestnet ? "Mainnet" : "Testnet"}`}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border transition-all cursor-pointer ${
              isTestnet
                ? "bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20"
                : "bg-green-50 dark:bg-green-500/10 border-green-300 dark:border-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/20"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isTestnet ? "bg-amber-500" : "bg-green-500"}`} />
            {isTestnet ? "Testnet" : "Mainnet"}
          </button>
        </div>

        {/* Mobile right: wallet avatar/connect + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          {/* Compact wallet indicator — tap avatar to open mobile menu which has disconnect */}
          {address ? (
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-1.5 cursor-pointer"
              title="Open menu"
            >
              {profile?.image ? (
                <img src={profile.image} alt={profile.name || "wallet"} className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <span className="w-6 h-6 rounded-full bg-pink-500/20 flex items-center justify-center text-[9px] text-pink-500">
                  {address.slice(2, 4).toUpperCase()}
                </span>
              )}
            </button>
          ) : (
            <button
              onClick={connect}
              disabled={connecting}
              className="text-xs font-medium px-2.5 py-1 rounded-full border border-pink-500/50 text-pink-500 hover:bg-pink-500/10 transition-all cursor-pointer disabled:opacity-50"
            >
              {connecting ? "…" : "Connect"}
            </button>
          )}

          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="w-8 h-8 flex flex-col items-center justify-center gap-1.5 rounded text-label hover:text-secondary transition-colors cursor-pointer"
          >
            <span className={`block w-5 h-0.5 bg-current transition-all duration-200 ${menuOpen ? "rotate-45 translate-y-2" : ""}`} />
            <span className={`block w-5 h-0.5 bg-current transition-all duration-200 ${menuOpen ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-0.5 bg-current transition-all duration-200 ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-border-header bg-bg/95 backdrop-blur-lg">
          <nav>
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={mobileLinkClass(href)}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
          </nav>
          {/* Disconnect (mobile, only when connected) */}
          {address && (
            <div className="border-t border-border-header">
              <button
                onClick={() => { disconnect(); setMenuOpen(false); }}
                className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-500/5 transition-colors cursor-pointer"
              >
                Disconnect wallet
              </button>
            </div>
          )}

          {/* Mobile controls row */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border-header">
            {/* Theme toggle */}
            <button
              onClick={() => { toggleTheme(); setMenuOpen(false); }}
              className="flex items-center gap-2 text-sm text-label hover:text-secondary transition-colors cursor-pointer"
            >
              {theme === "dark" ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.061l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06l-1.06-1.06a.75.75 0 10-1.061 1.06l1.06 1.06z" />
                  </svg>
                  Light mode
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.647 1.921a.75.75 0 01.808.083z" clipRule="evenodd" />
                  </svg>
                  Dark mode
                </>
              )}
            </button>

            {/* Network badge */}
            <button
              onClick={() => {
                if (pathname.startsWith("/create") || pathname.startsWith("/manage/")) {
                  if (!window.confirm("Switching networks will reset your form. Continue?")) return;
                }
                setNetwork(isTestnet ? "mainnet" : "testnet");
                setMenuOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                isTestnet
                  ? "bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-400"
                  : "bg-green-50 dark:bg-green-500/10 border-green-300 dark:border-green-500/20 text-green-700 dark:text-green-400"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isTestnet ? "bg-amber-500" : "bg-green-500"}`} />
              {isTestnet ? "Testnet" : "Mainnet"}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
