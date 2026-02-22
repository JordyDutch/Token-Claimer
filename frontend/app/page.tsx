"use client";

import { useState, useEffect } from "react";
import { JsonRpcProvider, Contract } from "ethers";
import { LSP7_FACTORY, LSP8_FACTORY, FACTORY_ABI, LUKSO_RPC } from "./lib/contracts";
import { fetchProfile, ProfileInfo } from "./lib/profile";
import Link from "next/link";

interface Campaign {
  contractAddr: string;
  creator: string;
  name: string;
  symbol: string;
  createdAt: number;
  isNFT: boolean;
  creatorProfile?: ProfileInfo | null;
}

export default function HomePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    const rpc = new JsonRpcProvider(LUKSO_RPC);
    const lsp7 = new Contract(LSP7_FACTORY, FACTORY_ABI, rpc);
    const lsp8 = new Contract(LSP8_FACTORY, FACTORY_ABI, rpc);

    try {
      const [total7, total8] = await Promise.all([
        lsp7.totalCampaigns().catch(() => BigInt(0)),
        lsp8.totalCampaigns().catch(() => BigInt(0)),
      ]);

      const all: Campaign[] = [];

      if (total7 > BigInt(0)) {
        const items = await lsp7.getCampaigns(0, total7);
        for (const c of items) {
          all.push({
            contractAddr: c.contractAddr,
            creator: c.creator,
            name: c.name,
            symbol: c.symbol,
            createdAt: Number(c.createdAt),
            isNFT: false,
          });
        }
      }

      if (total8 > BigInt(0)) {
        const items = await lsp8.getCampaigns(0, total8);
        for (const c of items) {
          all.push({
            contractAddr: c.contractAddr,
            creator: c.creator,
            name: c.name,
            symbol: c.symbol,
            createdAt: Number(c.createdAt),
            isNFT: true,
          });
        }
      }

      // Sort by newest first
      all.sort((a, b) => b.createdAt - a.createdAt);

      // Fetch creator profiles in background
      const uniqueCreators = [...new Set(all.map((c) => c.creator))];
      const profiles = new Map<string, ProfileInfo | null>();
      await Promise.all(
        uniqueCreators.map(async (addr) => {
          try {
            profiles.set(addr, await fetchProfile(addr));
          } catch {
            profiles.set(addr, null);
          }
        })
      );
      for (const c of all) c.creatorProfile = profiles.get(c.creator);

      setCampaigns(all);
    } catch (e) {
      console.error("Failed to load campaigns:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh px-3 py-8 sm:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">Token Claimer</h1>
          <p className="text-zinc-400 text-sm sm:text-base mb-6">
            Create and discover token drops on LUKSO
          </p>
          <Link
            href="/create"
            className="inline-block px-6 py-3 rounded-xl text-sm sm:text-base font-semibold bg-purple-500 text-white hover:bg-purple-600 transition-all active:scale-[0.97]"
          >
            Create a Drop
          </Link>
        </div>

        {/* Campaigns */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider px-1">
            {loading ? "Loading..." : `${campaigns.length} Drop${campaigns.length !== 1 ? "s" : ""}`}
          </h2>

          {!loading && campaigns.length === 0 && (
            <div className="bg-[#12121a] rounded-2xl p-8 text-center border border-purple-500/10">
              <div className="text-4xl mb-3">🎵</div>
              <p className="text-zinc-400 text-sm">No drops yet. Be the first to create one!</p>
            </div>
          )}

          {campaigns.map((c) => (
            <Link
              key={c.contractAddr}
              href={`/claim/${c.contractAddr}`}
              className="block bg-[#12121a] rounded-2xl p-4 sm:p-5 border border-purple-500/10 hover:border-purple-500/30 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-violet-600 to-purple-400 flex items-center justify-center text-2xl flex-shrink-0">
                  {c.isNFT ? "🎵" : "🪙"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm sm:text-base truncate group-hover:text-purple-400 transition-colors">
                      {c.name}
                    </h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 flex-shrink-0">
                      {c.isNFT ? "NFT" : "Token"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {c.creatorProfile?.image && (
                      <img src={c.creatorProfile.image} alt="" className="w-4 h-4 rounded-full object-cover" />
                    )}
                    <span className="text-zinc-500 text-xs truncate">
                      {c.creatorProfile?.name || `${c.creator.slice(0, 6)}...${c.creator.slice(-4)}`}
                    </span>
                    <span className="text-zinc-600 text-xs">·</span>
                    <span className="text-zinc-600 text-xs flex-shrink-0">
                      {new Date(c.createdAt * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="text-zinc-600 group-hover:text-purple-400 transition-colors flex-shrink-0">→</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="text-center mt-8">
          <p className="text-zinc-600 text-[10px] sm:text-xs">
            Powered by{" "}
            <a href="https://lukso.network" target="_blank" className="text-purple-400 hover:underline">LUKSO</a>
          </p>
        </div>
      </div>
    </div>
  );
}
