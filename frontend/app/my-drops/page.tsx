"use client";

import { useState, useEffect, useCallback } from "react";
import { JsonRpcProvider, Contract } from "ethers";
import {
  LSP7_FACTORY_ABI, LSP8_FACTORY_ABI, CLAIM_ABI,
  LSP7_EXTRA_ABI, LSP8_EXTRA_ABI,
  detectTokenType,
} from "../lib/contracts";
import { LSP4_METADATA_KEY } from "../lib/lsp4";
import { SecretDropSummary } from "../lib/secret-drop";

const IPFS_GATEWAY = "https://api.universalprofile.cloud/ipfs";
const GET_DATA_ABI = ["function getData(bytes32 key) view returns (bytes memory)"];

async function fetchDropIcon(contractAddr: string, provider: JsonRpcProvider): Promise<string | null> {
  try {
    const c = new Contract(contractAddr, GET_DATA_ABI, provider);
    const raw: string = await c.getData(LSP4_METADATA_KEY);
    if (!raw || raw === "0x" || raw.length < 10) return null;
    const urlHex = raw.slice(2 + 8 + 64);
    if (!urlHex || urlHex.length < 8) return null;
    const ipfsUrl = Buffer.from(urlHex, "hex").toString("utf8");
    const cid = ipfsUrl.replace("ipfs://", "");
    const res = await fetch(`${IPFS_GATEWAY}/${cid}`);
    if (!res.ok) return null;
    const json = await res.json();
    const icon = json?.LSP4Metadata?.icon?.[0]?.url
      ?? json?.LSP4Metadata?.images?.[0]?.[0]?.url;
    if (!icon) return null;
    return `${IPFS_GATEWAY}/${icon.replace("ipfs://", "")}`;
  } catch {
    return null;
  }
}
import Link from "next/link";
import CopyButton from "../components/CopyButton";
import Footer from "../components/Footer";
import { useWallet } from "../components/WalletProvider";
import { useNetwork } from "../components/NetworkProvider";
import { useUPProvider } from "../components/UPProviderInit";

interface MyDrop {
  contractAddr: string;
  name: string;
  symbol: string;
  createdAt: number;
  isNFT: boolean;
  claimEnabled: boolean;
  isActive: boolean;
  totalClaimed: string;
  maxSupply: string;
  icon?: string | null;
}

export default function MyDropsPage() {
  const { address, profile, connect: walletConnect, disconnect } = useWallet();
  const { config: networkConfig, networkId } = useNetwork();
  const { inIframe } = useUPProvider();
  const [drops, setDrops] = useState<MyDrop[]>([]);
  const [secretDrops, setSecretDrops] = useState<SecretDropSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDrops = useCallback(async (userAddr: string) => {
    setLoading(true);
    setError(null);
    const rpc = new JsonRpcProvider(networkConfig.rpc);

    try {
      interface RawCampaign {
        contractAddr: string;
        creator: string;
        name: string;
        symbol: string;
        createdAt: number;
        isNFT: boolean;
      }

      const seen = new Set<string>();
      const mine: RawCampaign[] = [];

      // Query ALL historical LSP7 factories so drops survive redeployments
      await Promise.all(
        networkConfig.allLsp7Factories.map(async (factoryAddr) => {
          try {
            const lsp7 = new Contract(factoryAddr, LSP7_FACTORY_ABI, rpc);
            const total = await lsp7.totalCampaigns().catch(() => BigInt(0));
            if (total <= BigInt(0)) return;
            const items = await lsp7.getCampaigns(0, total);
            for (const c of items) {
              if (c.creator.toLowerCase() !== userAddr.toLowerCase()) continue;
              const addr = c.contractAddr.toLowerCase();
              if (seen.has(addr)) continue;
              seen.add(addr);
              mine.push({
                contractAddr: c.contractAddr,
                creator: c.creator,
                name: c.name,
                symbol: c.symbol,
                createdAt: Number(c.createdAt),
                isNFT: false,
              });
            }
          } catch {
            // Skip unresponsive factories silently
          }
        })
      );

      // Query ALL historical LSP8 factories
      await Promise.all(
        networkConfig.allLsp8Factories.map(async (factoryAddr) => {
          try {
            const lsp8 = new Contract(factoryAddr, LSP8_FACTORY_ABI, rpc);
            const total = await lsp8.totalNFTCampaigns().catch(() => BigInt(0));
            if (total <= BigInt(0)) return;
            const items = await lsp8.getNFTCampaigns(0, total);
            for (const c of items) {
              if (c.creator.toLowerCase() !== userAddr.toLowerCase()) continue;
              const addr = c.contractAddr.toLowerCase();
              if (seen.has(addr)) continue;
              seen.add(addr);
              mine.push({
                contractAddr: c.contractAddr,
                creator: c.creator,
                name: c.name,
                symbol: c.symbol,
                createdAt: Number(c.createdAt),
                isNFT: true,
              });
            }
          } catch {
            // Skip unresponsive factories silently
          }
        })
      );

      mine.sort((a, b) => b.createdAt - a.createdAt);

      // Fetch live stats for each drop
      const abi = [...CLAIM_ABI, ...LSP7_EXTRA_ABI, ...LSP8_EXTRA_ABI];
      const withStats: MyDrop[] = await Promise.all(
        mine.map(async (raw) => {
          const c = new Contract(raw.contractAddr, abi, rpc);
          const safe = (p: Promise<any>, fb: any) => p.catch(() => fb);
          try {
            const type = await detectTokenType(c);
            const [enabled, active, supply] = await Promise.all([
              safe(c.claimEnabled(), false),
              safe(c.isClaimActive(), false),
              safe(c.maxSupply(), BigInt(0)),
            ]);

            let claimed = "0";
            if (type === "LSP7") {
              const cl = await safe(c.totalClaimers(), BigInt(0));
              claimed = cl.toString();
            } else {
              const cl = await safe(c.totalClaimed(), BigInt(0));
              claimed = cl.toString();
            }

            return {
              ...raw,
              claimEnabled: enabled,
              isActive: active,
              totalClaimed: claimed,
              maxSupply: supply === BigInt(0) ? "Unlimited" : supply.toString(),
            };
          } catch {
            return {
              ...raw,
              claimEnabled: false,
              isActive: false,
              totalClaimed: "?",
              maxSupply: "?",
            };
          }
        })
      );

      setDrops(withStats);

      // Fetch secret drops from KV
      try {
        const url = `/api/secret-drop/by-creator?address=${encodeURIComponent(userAddr)}&network=${networkId}`;
        console.log("[my-drops] fetching secret drops:", url);
        const res = await fetch(url);
        const data = await res.json();
        console.log("[my-drops] secret drops response:", res.status, data);
        if (res.ok) {
          setSecretDrops(data.drops ?? []);
        }
      } catch (err) {
        console.error("[my-drops] secret drops fetch failed:", err);
      }

      // Fetch icons in background
      withStats.forEach(async (drop) => {
        const icon = await fetchDropIcon(drop.contractAddr, rpc);
        if (icon) {
          setDrops((prev) =>
            prev.map((d) => d.contractAddr === drop.contractAddr ? { ...d, icon } : d)
          );
        }
      });
    } catch (e) {
      console.error(e);
      setError("Failed to load drops");
    } finally {
      setLoading(false);
    }
  }, [networkConfig, networkId]);

  async function connect() {
    setError(null);
    const addr = await walletConnect();
    if (!addr) {
      setError("Install the Universal Profile Browser Extension");
      return;
    }
  }

  // Auto-load drops when wallet is connected or network changes
  useEffect(() => {
    if (address) loadDrops(address);
  }, [address, loadDrops, networkId]);

  const card = "bg-card rounded-xl p-4 sm:p-6 border border-border-muted card-elevated";

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
            <span className="text-purple-500 font-bold">BETA</span> · Report issues
          </a>
        )}
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">My Drops</h1>
            <p className="text-label text-xs sm:text-sm mt-1">
              Manage your token and NFT drops
            </p>
          </div>
          <Link
            href="/create"
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-purple-500 text-white hover:bg-purple-600 transition-all active:scale-[0.97] flex-shrink-0"
          >
            + New Drop
          </Link>
        </div>

        {/* Not connected */}
        {!address && (
          <div className={card + " text-center"}>
            <div className="text-4xl mb-3">🔗</div>
            <p className="text-muted text-sm mb-4">
              Connect your Universal Profile to see your drops
            </p>
            <button
              onClick={connect}
              className="px-6 py-3 rounded-xl text-sm font-semibold border-2 border-purple-400 text-purple-400 hover:bg-purple-400/10 transition-all cursor-pointer active:scale-[0.97]"
            >
              Connect Universal Profile
            </button>
          </div>
        )}

        {/* Connected header */}
        {address && (
          <div className="flex items-center gap-2 mb-4">
            {profile?.image && (
              <img src={profile.image} alt="" className="w-5 h-5 rounded-full object-cover" />
            )}
            <span className="text-tertiary text-xs sm:text-sm">
              {profile?.name || `${address.slice(0, 6)}...${address.slice(-4)}`}
            </span>
            <button
              onClick={() => { disconnect(); setDrops([]); setSecretDrops([]); }}
              className="text-faint text-[10px] hover:text-muted ml-1 cursor-pointer"
            >
              Disconnect
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 px-3 py-2.5 rounded-xl text-xs sm:text-sm mb-4">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className={card + " animate-pulse"}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-surface" />
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
        {address && !loading && drops.length === 0 && secretDrops.length === 0 && (
          <div className={card + " text-center"}>
            <div className="text-4xl mb-3">🚀</div>
            <p className="text-muted text-sm mb-2">You haven't created any drops yet</p>
            <Link
              href="/create"
              className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              Create your first drop →
            </Link>
          </div>
        )}

        {/* Drops list — merge on-chain + secret, sorted by createdAt */}
        {(drops.length > 0 || secretDrops.length > 0) && (
          <div className="space-y-3">
            {[
              ...drops.map((d) => ({ type: "onchain" as const, createdAt: d.createdAt, data: d })),
              ...secretDrops.map((s) => ({ type: "secret" as const, createdAt: s.createdAt, data: s })),
            ]
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((item) =>
                item.type === "onchain" ? (
                  <div key={item.data.contractAddr} className={card}>
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-purple-400 flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden">
                        {item.data.icon ? (
                          <img src={item.data.icon} alt="" className="w-full h-full object-cover" />
                        ) : (
                          item.data.isNFT ? "🖼" : "🪙"
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="font-semibold text-sm sm:text-base truncate">
                            {item.data.name}
                          </h3>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-label flex-shrink-0">
                            {item.data.isNFT ? "NFT" : "Token"}
                          </span>
                          {/* Status badge */}
                          {item.data.claimEnabled ? (
                            item.data.isActive ? (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-500/20 flex-shrink-0">
                                Live
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-500/20 flex-shrink-0">
                                Scheduled
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-500/20 flex-shrink-0">
                              Paused
                            </span>
                          )}
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center gap-4 text-[10px] sm:text-xs text-label mb-3">
                          <span>{item.data.totalClaimed} claimed</span>
                          <span>Supply: {item.data.maxSupply}</span>
                          <span>{new Date(item.data.createdAt * 1000).toLocaleDateString()}</span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/manage/${item.data.contractAddr}`}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-all"
                          >
                            Manage
                          </Link>
                          <Link
                            href={`/claim/${item.data.contractAddr}`}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted border border-border-default hover:border-border-muted hover:text-tertiary transition-all"
                          >
                            View claim page
                          </Link>
                          <CopyButton
                            text={typeof window !== "undefined" ? `${window.location.origin}/claim/${item.data.contractAddr}` : `/claim/${item.data.contractAddr}`}
                            label="Copy link"
                            className="px-3 py-1.5 rounded-lg text-xs border border-border-muted hover:border-border-default"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={item.data.id} className={card}>
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden">
                        {item.data.image ? (
                          <img src={`https://api.universalprofile.cloud/ipfs/${item.data.image}`} alt="" className="w-full h-full object-cover" />
                        ) : (
                          "🔒"
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="font-semibold text-sm sm:text-base truncate">
                            {item.data.title}
                          </h3>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30 flex-shrink-0">
                            Secret
                          </span>
                          {/* Status badge */}
                          {item.data.active ? (
                            item.data.mode === "pool" && item.data.remaining === 0 ? (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-50 dark:bg-gray-500/10 text-gray-700 dark:text-gray-400 border border-gray-300 dark:border-gray-500/20 flex-shrink-0">
                                All claimed
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-500/20 flex-shrink-0">
                                Live
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-500/20 flex-shrink-0">
                              Paused
                            </span>
                          )}
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center gap-4 text-[10px] sm:text-xs text-label mb-3">
                          {item.data.mode === "pool" && item.data.remaining !== null && (
                            <span>{item.data.remaining}/{item.data.totalCodes} remaining</span>
                          )}
                          {item.data.mode === "shared" && (
                            <span>{item.data.totalCodes} code{item.data.totalCodes !== 1 ? "s" : ""}</span>
                          )}
                          <span>{new Date(item.data.createdAt * 1000).toLocaleDateString()}</span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/secret-drop/${item.data.id}/manage`}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-all"
                          >
                            Manage
                          </Link>
                          <Link
                            href={`/secret-drop/${item.data.id}`}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted border border-border-default hover:border-border-muted hover:text-tertiary transition-all"
                          >
                            View claim page
                          </Link>
                          <CopyButton
                            text={typeof window !== "undefined" ? `${window.location.origin}/secret-drop/${item.data.id}` : `/secret-drop/${item.data.id}`}
                            label="Copy link"
                            className="px-3 py-1.5 rounded-lg text-xs border border-border-muted hover:border-border-default"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )}
          </div>
        )}

        {!inIframe && <Footer />}
      </div>
    </div>
  );
}
