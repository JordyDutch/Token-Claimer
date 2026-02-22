"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";
import {
  CLAIM_ABI, LSP7_EXTRA_ABI, LSP8_EXTRA_ABI, LUKSO_RPC, ZERO,
  getProvider, detectTokenType,
} from "../../lib/contracts";
import Link from "next/link";
import CopyButton from "../../components/CopyButton";
import Footer from "../../components/Footer";
import { useWallet } from "../../components/WalletProvider";

type Status = { message: string; type: "success" | "error" | "loading" } | null;

export default function ManagePage() {
  const params = useParams();
  const contractAddress = params.address as string;
  const { address, profile, connect: walletConnect, disconnect } = useWallet();

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
  const [linkCopied, setLinkCopied] = useState(false);

  const loadState = useCallback(async (userAddr: string) => {
    const rpc = new JsonRpcProvider(LUKSO_RPC);
    const abi = [...CLAIM_ABI, ...LSP7_EXTRA_ABI, ...LSP8_EXTRA_ABI];
    const c = new Contract(contractAddress, abi, rpc);
    try {
      const type = await detectTokenType(c);
      setTokenType(type);
      const owner = await c.owner();
      setIsOwner(owner.toLowerCase() === userAddr.toLowerCase());
      const safe = (p: Promise<any>, fallback: any = null) => p.catch(() => fallback);
      const [name, enabled, start, end, amount, supply, rT, rA, rF] = await Promise.all([
        safe(c.name(), ""),
        safe(c.claimEnabled(), false),
        safe(c.startTime(), BigInt(0)),
        safe(c.endTime(), BigInt(0)),
        safe(c.amountPerClaim(), BigInt(0)),
        safe(c.maxSupply(), BigInt(0)),
        safe(c.requiredToken(), ZERO),
        safe(c.requiredTokenAmount(), BigInt(0)),
        safe(c.requiredFollowers(), BigInt(0)),
      ]);
      setDropName(name);
      setClaimEnabled(enabled);
      setAmountPerClaim(amount ? amount.toString() : "0");
      setMaxSupply(supply ? supply.toString() : "0");
      setReqToken(!rT || rT === ZERO ? "" : rT);
      setReqTokenAmount(rA > BigInt(0) ? rA.toString() : "");
      setReqFollowers(rF > BigInt(0) ? rF.toString() : "");
      if (start > BigInt(0)) setStartTime(new Date(Number(start) * 1000).toISOString().slice(0, 16));
      if (end > BigInt(0)) setEndTime(new Date(Number(end) * 1000).toISOString().slice(0, 16));
      try {
        if (type === "LSP7") {
          const cl = await c.totalClaimers();
          setTotalClaimed(cl.toString());
        } else {
          const cl = await c.totalClaimed();
          setTotalClaimed(cl.toString());
        }
      } catch { setTotalClaimed("?"); }
    } catch (e) { console.error(e); }
  }, [contractAddress]);

  // Auto-load when wallet is already connected
  useEffect(() => {
    if (address) loadState(address);
  }, [address, loadState]);

  async function connect() {
    setStatus({ message: "Connecting...", type: "loading" });
    const addr = await walletConnect();
    if (!addr) {
      setStatus({ message: "Install the UP Browser Extension", type: "error" });
      return;
    }
    setStatus(null);
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
      setStatus({ message: "Updated successfully!", type: "success" });
      await loadState(address);
    } catch (e: any) {
      setStatus({ message: e.reason || e.message?.slice(0, 100) || "Failed", type: "error" });
    }
  }

  function copyClaimLink() {
    const url = `${window.location.origin}/claim/${contractAddress}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  const inp = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-purple-400 transition-colors";
  const lbl = "text-[11px] sm:text-xs text-zinc-500";
  const btn = "w-full py-2.5 sm:py-3 rounded-xl text-sm font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-all cursor-pointer active:scale-[0.97]";
  const card = "bg-[#12121a] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-purple-500/10";
  const explorerUrl = `https://explorer.execution.mainnet.lukso.network/address/${contractAddress}`;

  return (
    <div className="min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4">
      <div className="max-w-lg w-full space-y-3 sm:space-y-4">
        {/* Header card */}
        <div className={card}>
          <div className="flex items-center justify-between mb-1">
            <Link href={`/claim/${contractAddress}`} className="text-zinc-500 text-xs hover:text-purple-400 transition-colors">
              ← Claim page
            </Link>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {tokenType || "..."}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold mb-1">Manage Drop</h1>
          <p className="text-zinc-500 text-xs truncate mb-2">{dropName || contractAddress}</p>

          {/* Contract address with copy + explorer */}
          <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2 mb-3">
            <span className="text-[10px] font-mono text-zinc-500 truncate flex-1">
              {contractAddress}
            </span>
            <CopyButton text={contractAddress} label="Copy" />
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-zinc-500 hover:text-purple-400 transition-colors"
            >
              Explorer
            </a>
          </div>

          {/* Share claim link */}
          <button
            onClick={copyClaimLink}
            className="w-full py-2 rounded-lg text-xs font-medium border border-zinc-700 text-zinc-400 hover:text-purple-400 hover:border-purple-500/30 transition-all cursor-pointer mb-3"
          >
            {linkCopied ? "Claim link copied!" : "Copy claim link for sharing"}
          </button>

          {!address ? (
            <button
              onClick={connect}
              className="w-full py-3 rounded-xl text-sm font-semibold border-2 border-purple-400 text-purple-400 hover:bg-purple-400/10 transition-all cursor-pointer active:scale-[0.97]"
            >
              Connect Universal Profile
            </button>
          ) : !isOwner ? (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2.5 rounded-xl text-xs">
              You are not the owner of this contract. Only the owner can manage this drop.
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {profile?.image && (
                <img src={profile.image} alt="" className="w-5 h-5 rounded-full object-cover" />
              )}
              <span className="text-green-400 text-xs">
                ✓ {profile?.name || `${address.slice(0, 6)}...${address.slice(-4)}`}
              </span>
              <button
                onClick={() => { disconnect(); setIsOwner(false); }}
                className="text-zinc-600 text-[10px] hover:text-zinc-400 ml-1 cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>

        {address && isOwner && (
          <>
            {/* Stats + toggle */}
            <div className={card}>
              <div className="grid grid-cols-3 gap-3 text-center mb-4">
                <div>
                  <div className={lbl + " uppercase tracking-wider"}>Status</div>
                  <div className={`text-lg font-semibold ${claimEnabled ? "text-green-400" : "text-red-400"}`}>
                    {claimEnabled ? "Live" : "Paused"}
                  </div>
                </div>
                <div>
                  <div className={lbl + " uppercase tracking-wider"}>Claimed</div>
                  <div className="text-lg font-semibold text-purple-400">{totalClaimed}</div>
                </div>
                <div>
                  <div className={lbl + " uppercase tracking-wider"}>Supply</div>
                  <div className="text-lg font-semibold text-purple-400">
                    {maxSupply === "0" ? "Unlimited" : maxSupply}
                  </div>
                </div>
              </div>
              <button
                onClick={() =>
                  sendTx(
                    (c) => c.setClaimEnabled(!claimEnabled),
                    claimEnabled ? "Pausing claims..." : "Enabling claims..."
                  )
                }
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer active:scale-[0.97] ${
                  claimEnabled
                    ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                    : "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
                }`}
              >
                {claimEnabled ? "Pause Claims" : "Enable Claims"}
              </button>
            </div>

            {/* Claim window */}
            <div className={card}>
              <h2 className="text-xs font-semibold text-zinc-300 mb-3">Claim Window</h2>
              <p className="text-[10px] text-zinc-600 mb-3">
                Set a time window during which claims are allowed. Leave empty for no time restriction.
              </p>
              <div className="space-y-3">
                <div>
                  <label className={lbl}>Start time</label>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={inp + " mt-1"}
                  />
                </div>
                <div>
                  <label className={lbl}>End time</label>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={inp + " mt-1"}
                  />
                </div>
                <button
                  onClick={() => {
                    const s = startTime ? Math.floor(new Date(startTime).getTime() / 1000) : 0;
                    const e = endTime ? Math.floor(new Date(endTime).getTime() / 1000) : 0;
                    sendTx((c) => c.setClaimWindow(s, e), "Setting claim window...");
                  }}
                  className={btn}
                >
                  Set Window
                </button>
              </div>
            </div>

            {/* Amount per claim */}
            <div className={card}>
              <h2 className="text-xs font-semibold text-zinc-300 mb-1">
                {tokenType === "LSP7" ? "Tokens" : "NFTs"} Per Claim
              </h2>
              <p className="text-[10px] text-zinc-600 mb-3">
                How many {tokenType === "LSP7" ? "tokens" : "NFTs"} each user receives when they claim.
              </p>
              <input
                type="number"
                value={amountPerClaim}
                onChange={(e) => setAmountPerClaim(e.target.value)}
                className={inp}
                min="1"
              />
              <button
                onClick={() =>
                  sendTx((c) => c.setAmountPerClaim(amountPerClaim), "Updating amount...")
                }
                className={btn + " mt-3"}
              >
                Update Amount
              </button>
            </div>

            {/* Requirements */}
            <div className={card}>
              <h2 className="text-xs font-semibold text-zinc-300 mb-1">Requirements</h2>
              <p className="text-[10px] text-zinc-600 mb-3">
                Set conditions users must meet before they can claim. Leave empty for no requirements.
              </p>
              <div className="space-y-3">
                <div>
                  <label className={lbl}>Required token address (LSP7/LSP8)</label>
                  <input
                    value={reqToken}
                    onChange={(e) => setReqToken(e.target.value)}
                    placeholder="0x..."
                    className={inp + " mt-1 font-mono text-xs"}
                  />
                </div>
                <div>
                  <label className={lbl}>Minimum token balance</label>
                  <input
                    type="number"
                    value={reqTokenAmount}
                    onChange={(e) => setReqTokenAmount(e.target.value)}
                    placeholder="0"
                    className={inp + " mt-1"}
                  />
                </div>
                <div>
                  <label className={lbl}>Minimum followers (LSP26)</label>
                  <input
                    type="number"
                    value={reqFollowers}
                    onChange={(e) => setReqFollowers(e.target.value)}
                    placeholder="0"
                    className={inp + " mt-1"}
                  />
                </div>
                <button
                  onClick={() =>
                    sendTx(
                      (c) => c.setRequirements(reqToken || ZERO, reqTokenAmount || "0", reqFollowers || "0"),
                      "Updating requirements..."
                    )
                  }
                  className={btn}
                >
                  Update Requirements
                </button>
              </div>
            </div>
          </>
        )}

        {/* Status toast */}
        {status && (
          <div
            className={`px-3 py-2.5 rounded-xl text-xs sm:text-sm ${
              status.type === "success"
                ? "bg-green-500/10 border border-green-500/20 text-green-400"
                : status.type === "error"
                ? "bg-red-500/10 border border-red-500/20 text-red-400"
                : "bg-purple-500/10 border border-purple-500/20 text-purple-400"
            }`}
          >
            {status.message}
          </div>
        )}

        {/* Footer nav */}
        <div className="flex justify-between px-2 pb-4">
          <Link href="/" className="text-zinc-600 text-[10px] sm:text-xs hover:text-purple-400 transition-colors">
            ← All drops
          </Link>
          <Footer />
        </div>
      </div>
    </div>
  );
}
