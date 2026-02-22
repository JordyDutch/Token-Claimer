"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";
import { CLAIM_ABI, LSP7_EXTRA_ABI, LSP8_EXTRA_ABI, LUKSO_RPC, ZERO, getProvider, ensureLuksoNetwork, detectTokenType } from "../../lib/contracts";
import { fetchProfile, ProfileInfo } from "../../lib/profile";
import Link from "next/link";

type Status = { message: string; type: "success" | "error" | "loading" } | null;

export default function ManagePage() {
  const params = useParams();
  const contractAddress = params.address as string;

  const [address, setAddress] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [tokenType, setTokenType] = useState<"LSP7" | "LSP8" | null>(null);
  const [dropName, setDropName] = useState("");
  const [claimEnabled, setClaimEnabled] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [amountPerClaim, setAmountPerClaim] = useState("");
  const [totalClaimed, setTotalClaimed] = useState("0");
  const [maxSupply, setMaxSupply] = useState("0");
  const [reqToken, setReqToken] = useState("");
  const [reqTokenAmount, setReqTokenAmount] = useState("");
  const [reqFollowers, setReqFollowers] = useState("");

  const loadState = useCallback(async (userAddr: string) => {
    const rpc = new JsonRpcProvider(LUKSO_RPC);
    const abi = [...CLAIM_ABI, ...LSP7_EXTRA_ABI, ...LSP8_EXTRA_ABI];
    const c = new Contract(contractAddress, abi, rpc);
    try {
      const type = await detectTokenType(c);
      setTokenType(type);
      const [owner, name, enabled, start, end, amount, supply, rT, rA, rF] = await Promise.all([
        c.owner(), c.name(), c.claimEnabled(), c.startTime(), c.endTime(),
        c.amountPerClaim(), c.maxSupply(), c.requiredToken(), c.requiredTokenAmount(), c.requiredFollowers(),
      ]);
      setIsOwner(owner.toLowerCase() === userAddr.toLowerCase());
      setDropName(name); setClaimEnabled(enabled); setAmountPerClaim(amount.toString()); setMaxSupply(supply.toString());
      setReqToken(rT === ZERO ? "" : rT);
      setReqTokenAmount(rA > BigInt(0) ? rA.toString() : "");
      setReqFollowers(rF > BigInt(0) ? rF.toString() : "");
      if (start > BigInt(0)) setStartTime(new Date(Number(start) * 1000).toISOString().slice(0, 16));
      if (end > BigInt(0)) setEndTime(new Date(Number(end) * 1000).toISOString().slice(0, 16));
      try {
        if (type === "LSP7") { const cl = await c.totalClaimers(); setTotalClaimed(cl.toString()); }
        else { const cl = await c.totalClaimed(); setTotalClaimed(cl.toString()); }
      } catch { setTotalClaimed("?"); }
    } catch (e) { console.error(e); }
  }, [contractAddress]);

  async function connect() {
    const p = getProvider();
    if (!p) { setStatus({ message: "Install UP Browser Extension", type: "error" }); return; }
    try {
      setStatus({ message: "Connecting...", type: "loading" });
      await ensureLuksoNetwork();
      const accounts = await p.request({ method: "eth_requestAccounts" });
      setAddress(accounts[0]); setStatus(null);
      await loadState(accounts[0]);
      fetchProfile(accounts[0]).then(setProfile);
    } catch (e: any) { setStatus({ message: e.message || "Failed", type: "error" }); }
  }

  async function sendTx(fn: (c: Contract) => Promise<any>, msg: string) {
    const p = getProvider();
    if (!p || !address) return;
    try {
      setStatus({ message: msg, type: "loading" });
      const provider = new BrowserProvider(p);
      const signer = await provider.getSigner();
      const c = new Contract(contractAddress, CLAIM_ABI, signer);
      const tx = await fn(c);
      setStatus({ message: "Waiting for confirmation...", type: "loading" });
      await tx.wait();
      setStatus({ message: "Done!", type: "success" });
      await loadState(address);
    } catch (e: any) { setStatus({ message: e.reason || e.message?.slice(0, 100) || "Failed", type: "error" }); }
  }

  const inp = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-purple-400 transition-colors";
  const lbl = "text-[11px] sm:text-xs text-zinc-500";
  const btn = "w-full py-2.5 sm:py-3 rounded-xl text-sm font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-all cursor-pointer active:scale-[0.97]";
  const card = "bg-[#12121a] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-purple-500/10";

  return (
    <div className="min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4">
      <div className="max-w-lg w-full space-y-3 sm:space-y-4">
        <div className={card}>
          <div className="flex items-center justify-between mb-1">
            <Link href={`/claim/${contractAddress}`} className="text-zinc-500 text-xs hover:text-purple-400">← Claim page</Link>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{tokenType || "..."}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold mb-1">Manage Drop</h1>
          <p className="text-zinc-500 text-xs truncate">{dropName || contractAddress}</p>

          {!address ? (
            <button onClick={connect} className="mt-4 w-full py-3 rounded-xl text-sm font-semibold border-2 border-purple-400 text-purple-400 hover:bg-purple-400/10 transition-all cursor-pointer active:scale-[0.97]">
              Connect Universal Profile
            </button>
          ) : !isOwner ? (
            <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2.5 rounded-xl text-xs">Not the contract owner</div>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              {profile?.image && <img src={profile.image} alt="" className="w-5 h-5 rounded-full object-cover" />}
              <span className="text-green-400 text-xs">✓ {profile?.name || `${address.slice(0, 6)}...${address.slice(-4)}`}</span>
              <button onClick={() => { setAddress(null); setProfile(null); setIsOwner(false); }} className="text-zinc-600 text-[10px] hover:text-zinc-400 ml-1">Disconnect</button>
            </div>
          )}
        </div>

        {address && isOwner && (
          <>
            <div className={card}>
              <div className="flex flex-wrap justify-between items-center gap-3">
                <div><div className={lbl + " uppercase tracking-wider"}>Status</div><div className={`text-lg font-semibold ${claimEnabled ? "text-green-400" : "text-red-400"}`}>{claimEnabled ? "Live" : "Paused"}</div></div>
                <div><div className={lbl + " uppercase tracking-wider"}>Claimed</div><div className="text-lg font-semibold text-purple-400">{totalClaimed}</div></div>
                <div><div className={lbl + " uppercase tracking-wider"}>Supply</div><div className="text-lg font-semibold text-purple-400">{maxSupply === "0" ? "∞" : maxSupply}</div></div>
              </div>
              <button onClick={() => sendTx(c => c.setClaimEnabled(!claimEnabled), claimEnabled ? "Disabling..." : "Enabling...")} className={`mt-4 w-full py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer active:scale-[0.97] ${claimEnabled ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-green-500/20 text-green-400 border border-green-500/30"}`}>
                {claimEnabled ? "Pause Claims" : "Enable Claims"}
              </button>
            </div>

            <div className={card}>
              <h2 className="text-xs font-semibold text-zinc-300 mb-3">Claim Window</h2>
              <div className="space-y-3">
                <div><label className={lbl}>Start</label><input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} className={inp + " mt-1"} /></div>
                <div><label className={lbl}>End</label><input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} className={inp + " mt-1"} /></div>
                <button onClick={() => { const s = startTime ? Math.floor(new Date(startTime).getTime() / 1000) : 0; const e = endTime ? Math.floor(new Date(endTime).getTime() / 1000) : 0; sendTx(c => c.setClaimWindow(s, e), "Setting..."); }} className={btn}>Set Window</button>
              </div>
            </div>

            <div className={card}>
              <h2 className="text-xs font-semibold text-zinc-300 mb-3">{tokenType === "LSP7" ? "Tokens" : "NFTs"} Per Claim</h2>
              <input type="number" value={amountPerClaim} onChange={e => setAmountPerClaim(e.target.value)} className={inp} min="1" />
              <button onClick={() => sendTx(c => c.setAmountPerClaim(amountPerClaim), "Updating...")} className={btn + " mt-3"}>Update Amount</button>
            </div>

            <div className={card}>
              <h2 className="text-xs font-semibold text-zinc-300 mb-3">Requirements</h2>
              <div className="space-y-3">
                <div><label className={lbl}>Token address (LSP7/LSP8)</label><input value={reqToken} onChange={e => setReqToken(e.target.value)} placeholder="0x..." className={inp + " mt-1 font-mono text-xs"} /></div>
                <div><label className={lbl}>Min token balance</label><input type="number" value={reqTokenAmount} onChange={e => setReqTokenAmount(e.target.value)} placeholder="0" className={inp + " mt-1"} /></div>
                <div><label className={lbl}>Min followers (LSP26)</label><input type="number" value={reqFollowers} onChange={e => setReqFollowers(e.target.value)} placeholder="0" className={inp + " mt-1"} /></div>
                <button onClick={() => sendTx(c => c.setRequirements(reqToken || ZERO, reqTokenAmount || "0", reqFollowers || "0"), "Updating...")} className={btn}>Update Requirements</button>
              </div>
            </div>
          </>
        )}

        {status && (
          <div className={`px-3 py-2.5 rounded-xl text-xs sm:text-sm ${status.type === "success" ? "bg-green-500/10 border border-green-500/20 text-green-400" : status.type === "error" ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-purple-500/10 border border-purple-500/20 text-purple-400"}`}>
            {status.message}
          </div>
        )}

        <div className="flex justify-between px-2 pb-4">
          <Link href="/" className="text-zinc-600 text-[10px] sm:text-xs hover:text-purple-400">← All drops</Link>
          <p className="text-zinc-600 text-[10px] sm:text-xs">Powered by <a href="https://lukso.network" target="_blank" className="text-purple-400 hover:underline">LUKSO</a></p>
        </div>
      </div>
    </div>
  );
}
