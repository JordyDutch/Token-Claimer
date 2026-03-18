"use client";

import { useState, useEffect } from "react";
import { JsonRpcProvider, Contract } from "ethers";
import { LSP7_FACTORY_ABI, LSP8_FACTORY_ABI } from "./lib/contracts";
import { fetchProfile, ProfileInfo } from "./lib/profile";
import { LSP4_METADATA_KEY } from "./lib/lsp4";
import { SecretDropSummary } from "./lib/secret-drop";

const IPFS_GATEWAY = "https://api.universalprofile.cloud/ipfs";
const GET_DATA_ABI = ["function getData(bytes32 key) view returns (bytes memory)"];

async function fetchCampaignIcon(contractAddr: string, provider: JsonRpcProvider): Promise<string | null> {
  try {
    const c = new Contract(contractAddr, GET_DATA_ABI, provider);
    const raw: string = await c.getData(LSP4_METADATA_KEY);
    if (!raw || raw === "0x" || raw.length < 10) return null;
    const bytes = Buffer.from(raw.replace(/^0x/, ""), "hex");
    const text = bytes.toString("utf8");
    const idx = text.indexOf("ipfs://");
    if (idx === -1) return null;
    const cid = text.slice(idx).replace("ipfs://", "");
    const res = await fetch(`${IPFS_GATEWAY}/${cid}`);
    if (!res.ok) return null;
    const json = await res.json();
    const icon = json?.LSP4Metadata?.images?.[0]?.[0]?.url
      ?? json?.LSP4Metadata?.icon?.[0]?.url;
    if (!icon) return null;
    if (icon.startsWith("https://") || icon.startsWith("http://")) return icon;
    return `${IPFS_GATEWAY}/${icon.replace("ipfs://", "")}`;
  } catch {
    return null;
  }
}
import Link from "next/link";
import Footer from "./components/Footer";
import { useNetwork } from "./components/NetworkProvider";
import { useUPProvider } from "./components/UPProviderInit";

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

type FilterTab = "all" | "tokens" | "nfts" | "secret";

type FeedItem =
  | { kind: "onchain"; data: Campaign }
  | { kind: "secret"; data: SecretDropSummary };

export default function HomePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [secretDrops, setSecretDrops] = useState<SecretDropSummary[]>([]);
  const [hiddenDrops, setHiddenDrops] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const { config: networkConfig, networkId } = useNetwork();
  const { inIframe } = useUPProvider();

  useEffect(() => {
    let stale = false;
    setCampaigns([]);
    setSecretDrops([]);
    setHiddenDrops(new Set());
    setLoading(true);
    loadCampaigns(networkConfig, () => stale);
    loadSecretDrops(networkConfig.id, () => stale);
    loadHiddenDrops(networkConfig.id, () => stale);
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkId]);

  async function loadCampaigns(cfg: typeof networkConfig, isStale: () => boolean) {
    const rpc = new JsonRpcProvider(cfg.rpc);

    try {
      const seen = new Set<string>();
      const all: Campaign[] = [];

      // Query ALL historical LSP7 factories
      await Promise.all(
        cfg.allLsp7Factories.map(async (factoryAddr) => {
          try {
            const lsp7 = new Contract(factoryAddr, LSP7_FACTORY_ABI, rpc);
            // v5 factories use totalCampaigns(), v3/v4 use totalTokenCampaigns()
            const total = await lsp7.totalCampaigns().catch(() =>
              lsp7.totalTokenCampaigns().catch(() => BigInt(0))
            );
            if (total <= BigInt(0)) return;
            const items = await lsp7.getCampaigns(0, total).catch(() => lsp7.getTokenCampaigns(0, total));
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
                // v5 Campaign struct has isNonDivisible; legacy factories don't
                isNFT: Boolean(c.isNonDivisible),
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

      if (isStale()) return; // network changed — discard results

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
      if (isStale()) return;
      setCampaigns((prev) =>
        prev.map((c) => ({ ...c, creatorProfile: profiles.get(c.creator) }))
      );

      // Fetch icons separately so they stream in as they resolve
      await Promise.all(
        all.map(async (c) => {
          if (isStale()) return;
          const icon = await fetchCampaignIcon(c.contractAddr, rpc);
          if (icon && !isStale()) {
            setCampaigns((prev) =>
              prev.map((p) => p.contractAddr === c.contractAddr ? { ...p, icon } : p)
            );
          }
        })
      );
    } catch (e) {
      console.error("Failed to load campaigns:", e);
      if (!isStale()) setLoading(false);
    }
  }

  async function loadSecretDrops(networkId: string, isStale: () => boolean) {
    try {
      const res = await fetch(`/api/secret-drop/explore?network=${networkId}`);
      if (!res.ok || isStale()) return;
      const data = await res.json();
      if (isStale()) return;
      const drops: SecretDropSummary[] = data.drops ?? [];
      setSecretDrops(drops);

      // Fetch creator profiles for secret drops
      const uniqueCreators = [...new Set(drops.map((d) => d.creator))];
      const profiles = new Map<string, ProfileInfo | null>();
      await Promise.all(
        uniqueCreators.map(async (addr) => {
          try { profiles.set(addr, await fetchProfile(addr)); }
          catch { profiles.set(addr, null); }
        })
      );
      if (isStale()) return;
      setSecretDrops((prev) =>
        prev.map((d) => ({ ...d, _creatorProfile: profiles.get(d.creator) }))
      );
    } catch {
      // Secret drops are non-critical — don't block the page
    }
  }

  async function loadHiddenDrops(networkId: string, isStale: () => boolean) {
    try {
      const res = await fetch(`/api/drop-visibility?network=${networkId}`);
      if (!res.ok || isStale()) return;
      const data = await res.json();
      if (isStale()) return;
      const hidden: string[] = data.hidden ?? [];
      setHiddenDrops(new Set(hidden.map((a: string) => a.toLowerCase())));
    } catch {
      // Non-critical — show all drops if fetch fails
    }
  }

  // Build unified feed — exclude hidden on-chain drops
  const visibleCampaigns = campaigns.filter(
    (c) => !hiddenDrops.has(c.contractAddr.toLowerCase())
  );
  const feedItems: FeedItem[] = [
    ...visibleCampaigns.map((c): FeedItem => ({ kind: "onchain", data: c })),
    ...secretDrops.map((s): FeedItem => ({ kind: "secret", data: s })),
  ];
  feedItems.sort((a, b) => {
    const aTime = a.kind === "onchain" ? a.data.createdAt : a.data.createdAt;
    const bTime = b.kind === "onchain" ? b.data.createdAt : b.data.createdAt;
    return bTime - aTime;
  });

  const filtered = feedItems.filter((item) => {
    // Tab filter
    if (filter === "tokens") { if (item.kind !== "onchain" || item.data.isNFT) return false; }
    else if (filter === "nfts") { if (item.kind !== "onchain" || !item.data.isNFT) return false; }
    else if (filter === "secret") { if (item.kind !== "secret") return false; }
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      if (item.kind === "onchain") {
        const c = item.data;
        return (
          c.name.toLowerCase().includes(q) ||
          c.symbol.toLowerCase().includes(q) ||
          c.contractAddr.toLowerCase().includes(q) ||
          (c.creatorProfile?.name || "").toLowerCase().includes(q)
        );
      }
      return item.data.title.toLowerCase().includes(q);
    }
    return true;
  });

  const tabClass = (tab: FilterTab) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
      filter === tab
        ? "bg-pink-500/15 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500 dark:border-pink-500/30"
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
    <div className={inIframe ? "px-4 py-4" : "min-h-dvh px-3 py-6 sm:p-8"}>
      <div className={inIframe ? "w-full relative" : "max-w-6xl mx-auto"}>
        {inIframe && (
          <a
            href="https://github.com/JordyDutch/issue-tracker/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-0 right-0 text-[9px] text-faint hover:text-label transition-colors z-10"
          >
            <span className="text-pink-500 font-bold">BETA</span> · Report issues
          </a>
        )}
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
            className="inline-block px-6 py-3 rounded-xl text-sm sm:text-base font-semibold bg-pink-500 text-white hover:bg-pink-600 transition-all active:scale-[0.97]"
          >
            + Create a Drop
          </Link>
        </div>

        {/* Search + Filters */}
        <div className="mb-4 space-y-3">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, symbol, or address..."
              className="w-full bg-card border border-border-muted rounded-xl px-4 py-2.5 pr-8 text-sm text-tertiary placeholder:text-faint focus:outline-none focus:border-pink-500/40 transition-colors"
            />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted text-sm cursor-pointer">×</button>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setFilter("all")} className={tabClass("all")}>
              All
            </button>
            <button onClick={() => setFilter("nfts")} className={tabClass("nfts")}>
              NFTs
            </button>
            <button onClick={() => setFilter("tokens")} className={tabClass("tokens")}>
              Tokens
            </button>
            <button onClick={() => setFilter("secret")} className={tabClass("secret")}>
              Secret
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
                : "No drops yet. Be the first to create one!"}
            </p>
          </div>
        )}

        {/* Feed list */}
        <div className="space-y-3">
          {filtered.map((item) =>
            item.kind === "onchain" ? (
              <Link
                key={item.data.contractAddr}
                href={`/claim/${item.data.contractAddr}`}
                className="block bg-card rounded-xl p-4 sm:p-5 border border-border-muted hover:border-pink-500/30 card-elevated transition-all group focus:ring-2 focus:ring-pink-500 focus:outline-none"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden">
                    {item.data.icon ? (
                      <img src={item.data.icon} alt={item.data.name} className="w-full h-full object-cover" />
                    ) : (
                      item.data.isNFT ? "🖼" : "🪙"
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm sm:text-base truncate group-hover:text-pink-500 transition-colors">
                        {item.data.name}
                      </h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted flex-shrink-0">
                        {item.data.isNFT ? "NFT" : "Token"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {item.data.creatorProfile?.image && (
                        <img
                          src={item.data.creatorProfile.image}
                          alt=""
                          className="w-4 h-4 rounded-full object-cover"
                        />
                      )}
                      <span className="text-label text-xs truncate">
                        {item.data.creatorProfile?.name ||
                          `${item.data.creator.slice(0, 6)}...${item.data.creator.slice(-4)}`}
                      </span>
                      <span className="text-ghost text-xs flex-shrink-0">
                        {timeSince(item.data.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="text-faint group-hover:text-pink-500 transition-colors flex-shrink-0 text-lg">
                    →
                  </div>
                </div>
              </Link>
            ) : (
              <Link
                key={item.data.id}
                href={`/secret-drop/${item.data.id}`}
                className="block bg-card rounded-xl p-4 sm:p-5 border border-border-muted hover:border-violet-500/30 card-elevated transition-all group focus:ring-2 focus:ring-pink-500 focus:outline-none"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden">
                    {item.data.image ? (
                      <img src={`${IPFS_GATEWAY}/${item.data.image}`} alt="" className="w-full h-full object-cover" />
                    ) : (
                      "🔒"
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm sm:text-base truncate group-hover:text-violet-400 transition-colors">
                        {item.data.title}
                      </h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30 flex-shrink-0">
                        Secret
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {(item.data as any)._creatorProfile?.image && (
                        <img
                          src={(item.data as any)._creatorProfile.image}
                          alt=""
                          className="w-4 h-4 rounded-full object-cover"
                        />
                      )}
                      <span className="text-label text-xs truncate">
                        {(item.data as any)._creatorProfile?.name ||
                          `${item.data.creator.slice(0, 6)}...${item.data.creator.slice(-4)}`}
                      </span>
                      <span className="text-ghost text-xs flex-shrink-0">
                        {timeSince(item.data.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="text-faint group-hover:text-violet-400 transition-colors flex-shrink-0 text-lg">
                    →
                  </div>
                </div>
              </Link>
            )
          )}
        </div>

        {!inIframe && <Footer />}
      </div>
    </div>
  );
}
