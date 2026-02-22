"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { JsonRpcProvider, Contract, Interface, id } from "ethers";
import { LSP7_FACTORY_ABI, LSP8_FACTORY_ABI } from "../lib/contracts";
import { fetchProfile, ProfileInfo } from "../lib/profile";
import { useNetwork } from "../components/NetworkProvider";
import { useUPProvider } from "../components/UPProviderInit";
import Link from "next/link";
import Footer from "../components/Footer";

/* ---------- Event topics ---------- */
const TOPIC_TOKEN_CLAIMED = id("TokensClaimed(address,uint256)");
const TOPIC_NFT_CLAIMED = id("NFTsClaimed(address,uint256,uint256)");
const TOPIC_TOKEN_CREATED = id("TokenCampaignCreated(uint256,address,address,string,string)");
const TOPIC_NFT_CREATED = id("NFTCampaignCreated(uint256,address,address,string,string)");

const factoryIface = new Interface([
  "event TokenCampaignCreated(uint256 indexed campaignId, address indexed creator, address contractAddr, string name, string symbol)",
  "event NFTCampaignCreated(uint256 indexed campaignId, address indexed creator, address contractAddr, string name, string symbol)",
]);

const claimIface = new Interface([
  "event TokensClaimed(address indexed claimer, uint256 amount)",
  "event NFTsClaimed(address indexed claimer, uint256 firstTokenId, uint256 amount)",
]);

/* ---------- Types ---------- */
interface DropInfo {
  name: string;
  symbol: string;
  isNFT: boolean;
  creator: string;
}

interface ActivityItem {
  id: string;
  type: "create" | "claim";
  actor: string;
  dropAddress: string;
  dropName: string;
  dropSymbol: string;
  isNFT: boolean;
  blockNumber: number;
  timestamp: number;
  profile?: ProfileInfo | null;
}

const POLL_INTERVAL = 15_000;
const BLOCK_RANGE = 50_000; // ~3 days on LUKSO (5s blocks)

/* ---------- Helpers ---------- */
function timeSince(timestamp: number): string {
  if (!timestamp) return "";
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

async function buildDropMap(
  rpc: JsonRpcProvider,
  cfg: { allLsp7Factories: string[]; allLsp8Factories: string[] },
): Promise<Map<string, DropInfo>> {
  const map = new Map<string, DropInfo>();

  await Promise.all([
    ...cfg.allLsp7Factories.map(async (addr) => {
      try {
        const f = new Contract(addr, LSP7_FACTORY_ABI, rpc);
        const total = await f.totalTokenCampaigns().catch(() => BigInt(0));
        if (total <= BigInt(0)) return;
        const campaigns = await f.getTokenCampaigns(0, total);
        for (const c of campaigns) {
          map.set(c.contractAddr.toLowerCase(), {
            name: c.name, symbol: c.symbol, isNFT: false, creator: c.creator,
          });
        }
      } catch { /* skip */ }
    }),
    ...cfg.allLsp8Factories.map(async (addr) => {
      try {
        const f = new Contract(addr, LSP8_FACTORY_ABI, rpc);
        const total = await f.totalNFTCampaigns().catch(() => BigInt(0));
        if (total <= BigInt(0)) return;
        const campaigns = await f.getNFTCampaigns(0, total);
        for (const c of campaigns) {
          map.set(c.contractAddr.toLowerCase(), {
            name: c.name, symbol: c.symbol, isNFT: true, creator: c.creator,
          });
        }
      } catch { /* skip */ }
    }),
  ]);

  return map;
}

async function fetchEvents(
  rpc: JsonRpcProvider,
  cfg: { allLsp7Factories: string[]; allLsp8Factories: string[] },
  dropMap: Map<string, DropInfo>,
  fromBlock: number,
  toBlock: number | string,
): Promise<ActivityItem[]> {
  const items: ActivityItem[] = [];
  const from = `0x${fromBlock.toString(16)}`;
  const to = typeof toBlock === "number" ? `0x${toBlock.toString(16)}` : toBlock;

  // --- Creation events from factories ---
  const factoryAddresses = [...cfg.allLsp7Factories, ...cfg.allLsp8Factories];
  try {
    const logs: any[] = await rpc.send("eth_getLogs", [{
      address: factoryAddresses,
      topics: [[TOPIC_TOKEN_CREATED, TOPIC_NFT_CREATED]],
      fromBlock: from,
      toBlock: to,
    }]);
    for (const log of logs) {
      try {
        const p = factoryIface.parseLog({ topics: log.topics, data: log.data });
        if (!p) continue;
        items.push({
          id: `create-${log.transactionHash}-${log.logIndex}`,
          type: "create",
          actor: p.args[1],          // creator (indexed)
          dropAddress: p.args[2],    // contractAddr
          dropName: p.args[3],       // name
          dropSymbol: p.args[4],     // symbol
          isNFT: p.name === "NFTCampaignCreated",
          blockNumber: parseInt(log.blockNumber, 16),
          timestamp: 0,
        });
      } catch { /* skip malformed log */ }
    }
  } catch { /* RPC error */ }

  // --- Claim events from drops (batch addresses in chunks of 50) ---
  const dropAddresses = [...dropMap.keys()];
  for (let i = 0; i < dropAddresses.length; i += 50) {
    const chunk = dropAddresses.slice(i, i + 50);
    try {
      const logs: any[] = await rpc.send("eth_getLogs", [{
        address: chunk,
        topics: [[TOPIC_TOKEN_CLAIMED, TOPIC_NFT_CLAIMED]],
        fromBlock: from,
        toBlock: to,
      }]);
      for (const log of logs) {
        try {
          const p = claimIface.parseLog({ topics: log.topics, data: log.data });
          if (!p) continue;
          const info = dropMap.get(log.address.toLowerCase());
          items.push({
            id: `claim-${log.transactionHash}-${log.logIndex}`,
            type: "claim",
            actor: p.args[0],       // claimer (indexed)
            dropAddress: log.address,
            dropName: info?.name ?? "Unknown Drop",
            dropSymbol: info?.symbol ?? "???",
            isNFT: info?.isNFT ?? false,
            blockNumber: parseInt(log.blockNumber, 16),
            timestamp: 0,
          });
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  // --- Fetch block timestamps ---
  const uniqueBlocks = [...new Set(items.map((i) => i.blockNumber))];
  const tsMap = new Map<number, number>();
  await Promise.all(
    uniqueBlocks.map(async (bn) => {
      try {
        const block = await rpc.getBlock(bn);
        if (block) tsMap.set(bn, block.timestamp);
      } catch { /* skip */ }
    }),
  );
  for (const item of items) {
    item.timestamp = tsMap.get(item.blockNumber) ?? 0;
  }

  items.sort((a, b) => b.blockNumber - a.blockNumber);
  return items;
}

/* ---------- Component ---------- */
export default function ActivityPage() {
  const { config: networkConfig, networkId } = useNetwork();
  const { inIframe } = useUPProvider();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const lastBlockRef = useRef(0);
  const dropMapRef = useRef(new Map<string, DropInfo>());
  const profileCacheRef = useRef(new Map<string, ProfileInfo | null>());

  // Force re-render every 60s so relative timestamps stay fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Initial load
  const load = useCallback(async () => {
    setLoading(true);
    setItems([]);
    profileCacheRef.current.clear();
    const rpc = new JsonRpcProvider(networkConfig.rpc);

    try {
      const map = await buildDropMap(rpc, networkConfig);
      dropMapRef.current = map;

      const currentBlock = await rpc.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - BLOCK_RANGE);
      lastBlockRef.current = currentBlock;

      const events = await fetchEvents(rpc, networkConfig, map, fromBlock, currentBlock);
      setItems(events);
      setLoading(false);

      // Enrich with profiles (fire-and-forget)
      const uniqueActors = [...new Set(events.map((e) => e.actor))];
      await Promise.all(
        uniqueActors.map(async (addr) => {
          try {
            profileCacheRef.current.set(addr, await fetchProfile(addr));
          } catch {
            profileCacheRef.current.set(addr, null);
          }
        }),
      );
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          profile: profileCacheRef.current.get(item.actor) ?? null,
        })),
      );
    } catch (e) {
      console.error("Failed to load activity:", e);
      setLoading(false);
    }
  }, [networkConfig]);

  useEffect(() => {
    load();
  }, [load]);

  // Polling for new events
  useEffect(() => {
    if (loading) return;

    const interval = setInterval(async () => {
      const rpc = new JsonRpcProvider(networkConfig.rpc);
      try {
        const currentBlock = await rpc.getBlockNumber();
        if (currentBlock <= lastBlockRef.current) return;

        const newEvents = await fetchEvents(
          rpc, networkConfig, dropMapRef.current,
          lastBlockRef.current + 1, currentBlock,
        );
        lastBlockRef.current = currentBlock;
        if (newEvents.length === 0) return;

        // Fetch profiles for new actors
        const newActors = [
          ...new Set(
            newEvents.map((e) => e.actor).filter((a) => !profileCacheRef.current.has(a)),
          ),
        ];
        await Promise.all(
          newActors.map(async (addr) => {
            try {
              profileCacheRef.current.set(addr, await fetchProfile(addr));
            } catch {
              profileCacheRef.current.set(addr, null);
            }
          }),
        );

        const enriched = newEvents.map((e) => ({
          ...e,
          profile: profileCacheRef.current.get(e.actor) ?? null,
        }));

        setItems((prev) => [...enriched, ...prev]);
      } catch { /* skip poll errors */ }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [loading, networkConfig]);

  return (
    <div className={inIframe ? "px-4 py-4" : "min-h-dvh px-3 py-6 sm:p-8"}>
      <div className={inIframe ? "w-full" : "max-w-3xl mx-auto"}>
        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">Activity</h1>
          <p className="text-label text-xs sm:text-sm">
            Live feed of drops and claims on LUKSO
          </p>
          {!loading && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-[10px] text-faint">
                Live &middot; updates every 15s
              </span>
            </div>
          )}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="bg-card rounded-xl px-4 py-3 border border-border-muted card-elevated animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-surface" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-surface rounded w-3/4" />
                    <div className="h-3 bg-surface-subtle rounded w-1/2" />
                  </div>
                  <div className="h-3 bg-surface-subtle rounded w-12" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="bg-card rounded-xl p-8 text-center border border-border-muted card-elevated">
            <p className="text-muted text-sm">No recent activity found</p>
            <p className="text-faint text-xs mt-1">
              Activity from the last ~3 days will appear here
            </p>
          </div>
        )}

        {/* Feed */}
        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/claim/${item.dropAddress}`}
                className="block bg-card rounded-xl px-4 py-3 border border-border-muted hover:border-purple-500/30 card-elevated transition-all group"
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-purple-400 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {item.profile?.image ? (
                      <img
                        src={item.profile.image}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-white font-medium text-[10px]">
                        {item.actor.slice(2, 4).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap text-sm">
                      <span className="font-medium truncate max-w-[140px]">
                        {item.profile?.name ||
                          `${item.actor.slice(0, 6)}...${item.actor.slice(-4)}`}
                      </span>
                      <span
                        className={
                          item.type === "create"
                            ? "text-blue-500 dark:text-blue-400"
                            : "text-green-600 dark:text-green-400"
                        }
                      >
                        {item.type === "create" ? "created" : "claimed"}
                      </span>
                      <span className="font-medium truncate max-w-[160px] group-hover:text-purple-400 transition-colors">
                        {item.dropName}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted flex-shrink-0">
                        {item.isNFT ? "NFT" : "Token"}
                      </span>
                    </div>
                  </div>

                  {/* Timestamp */}
                  <span className="text-faint text-[10px] flex-shrink-0 whitespace-nowrap">
                    {timeSince(item.timestamp)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!inIframe && <Footer />}
      </div>
    </div>
  );
}
