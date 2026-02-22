"use client";

import { useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import { LSP7_FACTORY, LSP8_FACTORY, FACTORY_ABI, getProvider, ensureLuksoNetwork } from "../lib/contracts";
import { fetchProfile, ProfileInfo } from "../lib/profile";
import Link from "next/link";

type Status = { message: string; type: "success" | "error" | "loading" } | null;

export default function CreatePage() {
  const [address, setAddress] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [dropType, setDropType] = useState<"token" | "nft">("nft");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [maxSupply, setMaxSupply] = useState("100");
  const [amountPerClaim, setAmountPerClaim] = useState("1");
  const [decimals, setDecimals] = useState("0");
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);

  async function connect() {
    const p = getProvider();
    if (!p) { setStatus({ message: "Install the Universal Profile Browser Extension", type: "error" }); return; }
    try {
      setStatus({ message: "Connecting...", type: "loading" });
      await ensureLuksoNetwork();
      const accounts = await p.request({ method: "eth_requestAccounts" });
      setAddress(accounts[0]);
      setStatus(null);
      fetchProfile(accounts[0]).then(setProfile);
    } catch (e: any) { setStatus({ message: e.message || "Connection failed", type: "error" }); }
  }

  async function deploy() {
    const p = getProvider();
    if (!p || !address || !name || !symbol) {
      setStatus({ message: "Name and symbol are required", type: "error" }); return;
    }
    try {
      setDeploying(true);
      setStatus({ message: "Creating your drop... confirm in your wallet", type: "loading" });
      const provider = new BrowserProvider(p);
      const signer = await provider.getSigner();
      let deployedAddr: string;

      if (dropType === "token") {
        const factory = new Contract(LSP7_FACTORY, FACTORY_ABI, signer);
        const tx = await factory.createTokenDrop(name, symbol, amountPerClaim, maxSupply, decimals);
        setStatus({ message: "Waiting for confirmation...", type: "loading" });
        await tx.wait();
        const fr = new Contract(LSP7_FACTORY, FACTORY_ABI, provider);
        const t = await fr.totalCampaigns();
        const items = await fr.getCampaigns(t - BigInt(1), 1);
        deployedAddr = items[0].contractAddr;
      } else {
        const factory = new Contract(LSP8_FACTORY, FACTORY_ABI, signer);
        const tx = await factory.createNFTDrop(name, symbol, maxSupply, amountPerClaim);
        setStatus({ message: "Waiting for confirmation...", type: "loading" });
        await tx.wait();
        const fr = new Contract(LSP8_FACTORY, FACTORY_ABI, provider);
        const t = await fr.totalCampaigns();
        const items = await fr.getCampaigns(t - BigInt(1), 1);
        deployedAddr = items[0].contractAddr;
      }
      setDeployedAddress(deployedAddr);
      setStatus({ message: "Drop created!", type: "success" });
    } catch (e: any) {
      setStatus({ message: e.reason || e.message?.slice(0, 120) || "Deploy failed", type: "error" });
    } finally { setDeploying(false); }
  }

  const inp = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-purple-400 transition-colors";
  const lbl = "text-[11px] sm:text-xs text-zinc-500 mb-1 block";
  const card = "bg-[#12121a] rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-purple-500/10";

  if (deployedAddress) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4">
        <div className={card + " max-w-md w-full text-center"}>
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-xl sm:text-2xl font-bold mb-2">Drop Created!</h1>
          <p className="text-zinc-400 text-sm mb-6">Your {dropType === "nft" ? "NFT" : "token"} drop is live on LUKSO</p>
          <div className="bg-zinc-800/50 rounded-xl p-3 mb-6">
            <p className="text-[10px] text-zinc-500 mb-1">Contract Address</p>
            <p className="text-xs font-mono text-purple-400 break-all">{deployedAddress}</p>
          </div>
          <div className="space-y-3">
            <Link href={`/manage/${deployedAddress}`} className="block w-full py-3 rounded-xl text-sm font-semibold bg-purple-500 text-white hover:bg-purple-600 transition-all active:scale-[0.97]">
              Manage Drop →
            </Link>
            <Link href={`/claim/${deployedAddress}`} className="block w-full py-3 rounded-xl text-sm font-semibold border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-all active:scale-[0.97]">
              View Claim Page →
            </Link>
            <Link href="/" className="block text-zinc-500 text-xs hover:text-purple-400 mt-4">← All drops</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4">
      <div className="max-w-md w-full space-y-4">
        <div className={card}>
          <Link href="/" className="text-zinc-500 text-xs hover:text-purple-400">← Back</Link>
          <h1 className="text-xl sm:text-2xl font-bold mt-2 mb-1">Create a Drop</h1>
          <p className="text-zinc-500 text-xs sm:text-sm mb-6">Deploy your own token or NFT claim campaign</p>

          {!address ? (
            <button onClick={connect} className="w-full py-3.5 rounded-xl text-sm font-semibold border-2 border-purple-400 text-purple-400 hover:bg-purple-400/10 transition-all cursor-pointer active:scale-[0.97]">
              Connect Universal Profile
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-6">
                {profile?.image && <img src={profile.image} alt="" className="w-5 h-5 rounded-full object-cover" />}
                <span className="text-zinc-300 text-xs">{profile?.name || `${address.slice(0, 6)}...${address.slice(-4)}`}</span>
                <button onClick={() => { setAddress(null); setProfile(null); }} className="text-zinc-600 text-[10px] hover:text-zinc-400 ml-1">Disconnect</button>
              </div>

              <div className="flex gap-2 mb-4">
                <button onClick={() => setDropType("nft")} className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${dropType === "nft" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>
                  🎵 NFT Drop
                </button>
                <button onClick={() => setDropType("token")} className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${dropType === "token" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>
                  🪙 Token Drop
                </button>
              </div>

              <div className="space-y-3">
                <div><label className={lbl}>Name *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="My Awesome Drop" className={inp} /></div>
                <div><label className={lbl}>Symbol *</label><input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="DROP" className={inp} maxLength={10} /></div>
                <div><label className={lbl}>Max Supply (0 = unlimited)</label><input type="number" value={maxSupply} onChange={e => setMaxSupply(e.target.value)} className={inp} min="0" /></div>
                <div><label className={lbl}>{dropType === "nft" ? "NFTs per claim" : "Tokens per claim"}</label><input type="number" value={amountPerClaim} onChange={e => setAmountPerClaim(e.target.value)} className={inp} min="1" /></div>
                {dropType === "token" && (
                  <div><label className={lbl}>Decimals (0 = whole, 18 = standard)</label><input type="number" value={decimals} onChange={e => setDecimals(e.target.value)} className={inp} min="0" max="18" /></div>
                )}
                <button onClick={deploy} disabled={deploying || !name || !symbol} className="w-full py-3.5 rounded-xl text-sm font-semibold bg-purple-500 text-white hover:bg-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.97] mt-2">
                  {deploying ? "Deploying..." : `Create ${dropType === "nft" ? "NFT" : "Token"} Drop`}
                </button>
              </div>
            </>
          )}
        </div>

        {status && (
          <div className={`px-3 py-2.5 rounded-xl text-xs sm:text-sm ${status.type === "success" ? "bg-green-500/10 border border-green-500/20 text-green-400" : status.type === "error" ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-purple-500/10 border border-purple-500/20 text-purple-400"}`}>
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
}
