"use client";

import { useState, useEffect } from "react";
import { JsonRpcProvider, Contract } from "ethers";
import { LSP7_FACTORY_ABI, LSP8_FACTORY_ABI } from "./lib/contracts";
import { fetchProfile, ProfileInfo } from "./lib/profile";
import { LSP4_METADATA_KEY } from "./lib/lsp4";

const IPFS_GATEWAY = "https://api.universalprofile.cloud/ipfs";
const GET_DATA_ABI = ["function getData(bytes32 key) view returns (bytes memory)"];

async function fetchCampaignIcon(contractAddr: string, provider: JsonRpcProvider): Promise<string | null> {
  try {
    const c = new Contract(contractAddr, GET_DATA_ABI, provider);
    const raw: string = await c.getData(LSP4_METADATA_KEY);
    if (!raw || raw === "0x" || raw.length < 10) return null;
    // VerifiableURI: 0x + 4-byte methodId (8 hex) + 32-byte hash (64 hex) + ipfs:// url bytes
    const urlHex = raw.slice(2 + 8 + 64); // skip 0x + methodId + hash
    if (!urlHex || urlHex.length < 8) return null;
    const ipfsUrl = Buffer.from(urlHex, "hex").toString("utf8");
    const cid = ipfsUrl.replace("ipfs://", "");
    const res = await fetch(`${IPFS_GATEWAY}/${cid}`);
    if (!res.ok) return null;
    const json = await res.json();
    const icon = json?.LSP4Metadata?.icon?.[0]?.url;
    if (!icon) return null;
    const iconCid = icon.replace("ipfs://", "");
    return `${IPFS_GATEWAY}/${iconCid}`;
  } catch {
    return null;
  }
}
import Link from "next/link";
import Footer from "./components/Footer";
import { useWallet } from "./components/WalletProvider";
import { useNetwork } from "./components/NetworkProvider";

interface Campaign {
  contractAddr: string;
  creator: string;
  name: string;
  symbol: string;
  createdAt: number;
  isNFT: boolean;
  creatorProfile?: ProfileInfo | null;
  icon?: string | null;
}

type FilterTab = "all" | "tokens" | "nfts" | "mine";

export default function HomePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const { address: walletAddress, connect: walletConnect } = useWallet();
  const { config: networkConfig, networkId } = useNetwork();

  useEffect(() => {
    loadCampaigns(networkConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkId]);

  async function connectForMyDrops() {
    const addr = await walletConnect();
    if (addr) setFilter("mine");
  }

  async function loadCampaigns(cfg: typeof networkConfig) {
    const rpc = new JsonRpcProvider(cfg.rpc);

    try {
      const seen = new Set<string>();
      const all: Campaign[] = [];

      // Query ALL historical LSP7 factories
      await Promise.all(
        cfg.allLsp7Factories.map(async (factoryAddr) => {
          try {
            const lsp7 = new Contract(factoryAddr, LSP7_FACTORY_ABI, rpc);
            const total = await lsp7.totalTokenCampaigns().catch(() => BigInt(0));
            if (total <= BigInt(0)) return;
            const items = await lsp7.getTokenCampaigns(0, total);
            for (const c of items) {
              const addr = c.contractAddr.toLowerCase();
              if (seen.has(addr)) continue;
              seen.add(addr);
              all.push({
                contractAddr: c.contractAddr,
                creator: c.creator,
                name: c.name,
                symbol: c.symbol,
                createdAt: Number(c.createdAt),
                isNFT: false,
              });
            }
          } catch { /* skip unresponsive factory */ }
        })
      );

      // Query ALL historical LSP8 factories
      await Promise.all(
        cfg.allLsp8Factories.map(async (factoryAddr) => {
          try {
            const lsp8 = new Contract(factoryAddr, LSP8_FACTORY_ABI, rpc);
            const total = await lsp8.totalNFTCampaigns().catch(() => BigInt(0));
            if (total <= BigInt(0)) return;
            const items = await lsp8.getNFTCampaigns(0, total);
            for (const c of items) {
              const addr = c.contractAddr.toLowerCase();
              if (seen.has(addr)) continue;
              seen.add(addr);
              all.push({
                contractAddr: c.contractAddr,
                creator: c.creator,
                name: c.name,
                symbol: c.symbol,
                createdAt: Number(c.createdAt),
                isNFT: true,
              });
            }
          } catch { /* skip unresponsive factory */ }
        })
      );

      all.sort((a, b) => b.createdAt - a.createdAt);

      // Show campaigns immediately, then fetch profiles
      setCampaigns(all);
      setLoading(false);

      // Fetch creator profiles + drop icons in background (parallel)
      const uniqueCreators = [...new Set(all.map((c) => c.creator))];
      const profiles = new Map<string, ProfileInfo | null>();

      await Promise.all([
        // Creator profiles
        ...uniqueCreators.map(async (addr) => {
          try {
            profiles.set(addr, await fetchProfile(addr));
          } catch {
            profiles.set(addr, null);
          }
        }),
      ]);
      setCampaigns((prev) =>
        prev.map((c) => ({ ...c, creatorProfile: profiles.get(c.creator) }))
      );

      // Fetch icons separately so they stream in as they resolve
      await Promise.all(
        all.map(async (c) => {
          const icon = await fetchCampaignIcon(c.contractAddr, rpc);
          if (icon) {
            setCampaigns((prev) =>
              prev.map((p) => p.contractAddr === c.contractAddr ? { ...p, icon } : p)
            );
          }
        })
      );
    } catch (e) {
      console.error("Failed to load campaigns:", e);
      setLoading(false);
    }
  }

  const filtered = campaigns.filter((c) => {
    if (filter === "tokens" && c.isNFT) return false;
    if (filter === "nfts" && !c.isNFT) return false;
    if (filter === "mine" && walletAddress && c.creator.toLowerCase() !== walletAddress.toLowerCase()) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q) ||
        c.contractAddr.toLowerCase().includes(q) ||
        (c.creatorProfile?.name || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const tabClass = (tab: FilterTab) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
      filter === tab
        ? "bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-300 dark:border-purple-500/30"
        : "text-label hover:text-secondary border border-transparent"
    }`;

  function timeSince(timestamp: number): string {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  return (
    <div className="min-h-dvh px-3 py-6 sm:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-8 sm:mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            Discover Drops
          </h1>
          <p className="text-muted text-sm sm:text-base mb-6">
            Claim tokens and NFTs on LUKSO
          </p>
          <Link
            href="/create"
            className="inline-block px-6 py-3 rounded-xl text-sm sm:text-base font-semibold bg-purple-500 text-white hover:bg-purple-600 transition-all active:scale-[0.97]"
          >
            + Create a Drop
          </Link>
        </div>

        {/* Search + Filters */}
        <div className="mb-4 space-y-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, symbol, or address..."
            className="w-full bg-card border border-border-muted rounded-xl px-4 py-2.5 text-sm text-tertiary placeholder:text-faint focus:outline-none focus:border-purple-500/40 transition-colors"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setFilter("all")} className={tabClass("all")}>
              All
            </button>
            <button onClick={() => setFilter("tokens")} className={tabClass("tokens")}>
              Tokens
            </button>
            <button onClick={() => setFilter("nfts")} className={tabClass("nfts")}>
              NFTs
            </button>
            <button
              onClick={() => {
                if (!walletAddress) {
                  connectForMyDrops();
                } else {
                  setFilter("mine");
                }
              }}
              className={tabClass("mine")}
            >
              My Drops
            </button>
            <span className="text-faint text-xs ml-auto">
              {loading ? "Loading..." : `${filtered.length} drop${filtered.length !== 1 ? "s" : ""}`}
            </span>
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-card rounded-xl p-4 sm:p-5 border border-border-muted card-elevated animate-pulse"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-surface" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-surface rounded w-1/3" />
                    <div className="h-3 bg-surface-subtle rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="bg-card rounded-xl p-8 text-center border border-border-muted card-elevated">
            <div className="text-4xl mb-3">{search || filter !== "all" ? "🔍" : "🚀"}</div>
            <p className="text-muted text-sm">
              {search
                ? "No drops match your search"
                : filter === "mine"
                ? "You haven't created any drops yet"
                : "No drops yet. Be the first to create one!"}
            </p>
            {filter === "mine" && (
              <Link
                href="/create"
                className="inline-block mt-3 text-xs text-purple-400 hover:text-purple-300"
              >
                Create your first drop →
              </Link>
            )}
          </div>
        )}

        {/* Campaign list */}
        <div className="space-y-3">
          {filtered.map((c) => (
            <Link
              key={c.contractAddr}
              href={`/claim/${c.contractAddr}`}
              className="block bg-card rounded-xl p-4 sm:p-5 border border-border-muted hover:border-purple-500/30 card-elevated transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-violet-600 to-purple-400 flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden">
                  {c.icon ? (
                    <img src={c.icon} alt="" className="w-full h-full object-cover" />
                  ) : (
                    c.isNFT ? "🖼" : "🪙"
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm sm:text-base truncate group-hover:text-purple-400 transition-colors">
                      {c.name}
                    </h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted flex-shrink-0">
                      {c.isNFT ? "NFT" : "Token"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {c.creatorProfile?.image && (
                      <img
                        src={c.creatorProfile.image}
                        alt=""
                        className="w-4 h-4 rounded-full object-cover"
                      />
                    )}
                    <span className="text-label text-xs truncate">
                      {c.creatorProfile?.name ||
                        `${c.creator.slice(0, 6)}...${c.creator.slice(-4)}`}
                    </span>
                    <span className="text-ghost text-xs flex-shrink-0">
                      {timeSince(c.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="text-faint group-hover:text-purple-400 transition-colors flex-shrink-0 text-lg">
                  →
                </div>
              </div>
            </Link>
          ))}
        </div>

        <Footer />
      </div>
    </div>
  );
}
