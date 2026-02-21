"use client";

import { useState } from "react";
import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";
import { fetchProfile, ProfileInfo } from "../lib/profile";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
const TOKEN_TYPE = process.env.NEXT_PUBLIC_TOKEN_TYPE || "LSP8";
const LUKSO_RPC = "https://rpc.mainnet.lukso.network";
const LUKSO_CHAIN_ID = "0x2a";

function getProvider() {
  if (typeof window === "undefined") return null;
  return (window as any).lukso || (window as any).ethereum || null;
}

const ADMIN_ABI = [
  "function owner() view returns (address)",
  "function claimEnabled() view returns (bool)",
  "function startTime() view returns (uint256)",
  "function endTime() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function amountPerClaim() view returns (uint256)",
  "function requiredToken() view returns (address)",
  "function requiredTokenAmount() view returns (uint256)",
  "function requiredFollowers() view returns (uint256)",
  "function isClaimActive() view returns (bool)",
  "function name() view returns (string)",
  "function setClaimEnabled(bool)",
  "function setClaimWindow(uint256,uint256)",
  "function setAmountPerClaim(uint256)",
  "function setRequirements(address,uint256,uint256)",
  "function totalClaimed() view returns (uint256)",
  "function totalClaimedAmount() view returns (uint256)",
  "function totalClaimers() view returns (uint256)",
];

type Status = { message: string; type: "success" | "error" | "loading" } | null;

export default function AdminPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [status, setStatus] = useState<Status>(null);

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
  const [profile, setProfile] = useState<ProfileInfo | null>(null);

  const isLSP7 = TOKEN_TYPE === "LSP7";

  async function connect() {
    const p = getProvider();
    if (!p) {
      setStatus({ message: "Install UP Browser Extension", type: "error" });
      return;
    }
    try {
      setStatus({ message: "Connecting...", type: "loading" });
      try {
        await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: LUKSO_CHAIN_ID }] });
      } catch (e: any) {
        if (e.code === 4902) {
          await p.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: LUKSO_CHAIN_ID,
              chainName: "LUKSO",
              nativeCurrency: { name: "LYX", symbol: "LYX", decimals: 18 },
              rpcUrls: [LUKSO_RPC],
              blockExplorerUrls: ["https://explorer.execution.mainnet.lukso.network"],
            }],
          });
        }
      }
      const accounts = await p.request({ method: "eth_requestAccounts" });
      setAddress(accounts[0]);
      setStatus(null);
      await loadState(accounts[0]);
      fetchProfile(accounts[0]).then(setProfile);
    } catch (e: any) {
      setStatus({ message: e.message || "Failed to connect", type: "error" });
    }
  }

  async function loadState(userAddress: string) {
    if (!CONTRACT_ADDRESS) return;
    const rpc = new JsonRpcProvider(LUKSO_RPC);
    const contract = new Contract(CONTRACT_ADDRESS, ADMIN_ABI, rpc);

    try {
      const [owner, name, enabled, start, end, amount, supply, rToken, rAmount, rFollowers] =
        await Promise.all([
          contract.owner(),
          contract.name(),
          contract.claimEnabled(),
          contract.startTime(),
          contract.endTime(),
          contract.amountPerClaim(),
          contract.maxSupply(),
          contract.requiredToken(),
          contract.requiredTokenAmount(),
          contract.requiredFollowers(),
        ]);

      setIsOwner(owner.toLowerCase() === userAddress.toLowerCase());
      setDropName(name);
      setClaimEnabled(enabled);
      setAmountPerClaim(amount.toString());
      setMaxSupply(supply.toString());

      const zero = "0x0000000000000000000000000000000000000000";
      setReqToken(rToken === zero ? "" : rToken);
      setReqTokenAmount(rAmount > BigInt(0) ? rAmount.toString() : "");
      setReqFollowers(rFollowers > BigInt(0) ? rFollowers.toString() : "");

      if (start > BigInt(0)) setStartTime(new Date(Number(start) * 1000).toISOString().slice(0, 16));
      if (end > BigInt(0)) setEndTime(new Date(Number(end) * 1000).toISOString().slice(0, 16));

      try {
        if (isLSP7) {
          const claimers = await contract.totalClaimers();
          setTotalClaimed(claimers.toString());
        } else {
          const claimed = await contract.totalClaimed();
          setTotalClaimed(claimed.toString());
        }
      } catch { setTotalClaimed("?"); }
    } catch (e) {
      console.error("Failed to load state:", e);
    }
  }

  async function sendTx(fn: (contract: Contract) => Promise<any>, msg: string) {
    const p = getProvider();
    if (!p || !address) return;
    try {
      setStatus({ message: msg, type: "loading" });
      const provider = new BrowserProvider(p);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, ADMIN_ABI, signer);
      const tx = await fn(contract);
      setStatus({ message: "Waiting for confirmation...", type: "loading" });
      await tx.wait();
      setStatus({ message: "Done!", type: "success" });
      await loadState(address);
    } catch (e: any) {
      setStatus({ message: e.reason || e.message?.slice(0, 100) || "Failed", type: "error" });
    }
  }

  const inputClass =
    "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-purple-400 transition-colors";
  const labelClass = "text-[11px] sm:text-xs text-zinc-500";
  const btnClass =
    "w-full py-2.5 sm:py-3 rounded-xl text-sm font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-all cursor-pointer active:scale-[0.97]";
  const cardClass = "bg-[#12121a] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-purple-500/10";

  if (!CONTRACT_ADDRESS) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
        <div className={cardClass + " max-w-md text-center"}>
          <h1 className="text-xl sm:text-2xl font-bold mb-4">Admin Panel</h1>
          <p className="text-zinc-400 text-sm">Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4">
      <div className="max-w-lg w-full space-y-3 sm:space-y-4">
        {/* Header */}
        <div className={cardClass}>
          <h1 className="text-xl sm:text-2xl font-bold mb-1">Admin Panel</h1>
          <p className="text-zinc-500 text-xs sm:text-sm truncate">{dropName || CONTRACT_ADDRESS}</p>

          {!address ? (
            <button
              onClick={connect}
              className="mt-4 w-full py-3 rounded-xl text-sm font-semibold border-2 border-purple-400 text-purple-400 hover:bg-purple-400/10 transition-all cursor-pointer active:scale-[0.97]"
            >
              Connect Universal Profile
            </button>
          ) : !isOwner ? (
            <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2.5 rounded-xl text-xs sm:text-sm">
              Connected wallet is not the contract owner
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              {profile?.image && (
                <img src={profile.image} alt="" className="w-5 h-5 rounded-full object-cover" />
              )}
              <span className="text-green-400 text-xs">
                \u2713 {profile?.name || `${address.slice(0, 6)}...${address.slice(-4)}`}
              </span>
            </div>
          )}
        </div>

        {address && isOwner && (
          <>
            {/* Stats + Toggle */}
            <div className={cardClass}>
              <div className="flex flex-wrap justify-between items-center gap-3">
                <div className="min-w-[60px]">
                  <div className={labelClass + " uppercase tracking-wider"}>Status</div>
                  <div className={`text-base sm:text-lg font-semibold ${claimEnabled ? "text-green-400" : "text-red-400"}`}>
                    {claimEnabled ? "Live" : "Paused"}
                  </div>
                </div>
                <div className="min-w-[60px]">
                  <div className={labelClass + " uppercase tracking-wider"}>Claimed</div>
                  <div className="text-base sm:text-lg font-semibold text-purple-400">{totalClaimed}</div>
                </div>
                <div className="min-w-[60px]">
                  <div className={labelClass + " uppercase tracking-wider"}>Supply</div>
                  <div className="text-base sm:text-lg font-semibold text-purple-400">
                    {maxSupply === "0" ? "\u221e" : maxSupply}
                  </div>
                </div>
              </div>

              <button
                onClick={() => sendTx((c) => c.setClaimEnabled(!claimEnabled), claimEnabled ? "Disabling..." : "Enabling...")}
                className={`mt-4 w-full py-2.5 sm:py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer active:scale-[0.97] ${
                  claimEnabled
                    ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                    : "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
                }`}
              >
                {claimEnabled ? "Pause Claims" : "Enable Claims"}
              </button>
            </div>

            {/* Time Window */}
            <div className={cardClass}>
              <h2 className="text-xs sm:text-sm font-semibold text-zinc-300 mb-3">Claim Window</h2>
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Start (leave empty = immediate)</label>
                  <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass + " mt-1"} />
                </div>
                <div>
                  <label className={labelClass}>End (leave empty = no end)</label>
                  <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass + " mt-1"} />
                </div>
                <button
                  onClick={() => {
                    const s = startTime ? Math.floor(new Date(startTime).getTime() / 1000) : 0;
                    const e = endTime ? Math.floor(new Date(endTime).getTime() / 1000) : 0;
                    sendTx((c) => c.setClaimWindow(s, e), "Setting window...");
                  }}
                  className={btnClass}
                >
                  Set Window
                </button>
              </div>
            </div>

            {/* Amount */}
            <div className={cardClass}>
              <h2 className="text-xs sm:text-sm font-semibold text-zinc-300 mb-3">
                {isLSP7 ? "Tokens" : "NFTs"} Per Claim
              </h2>
              <input
                type="number"
                value={amountPerClaim}
                onChange={(e) => setAmountPerClaim(e.target.value)}
                className={inputClass}
                min="1"
              />
              <button
                onClick={() => sendTx((c) => c.setAmountPerClaim(amountPerClaim), "Updating...")}
                className={btnClass + " mt-3"}
              >
                Update Amount
              </button>
            </div>

            {/* Requirements */}
            <div className={cardClass}>
              <h2 className="text-xs sm:text-sm font-semibold text-zinc-300 mb-3">Requirements (optional)</h2>
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Required token (LSP7/LSP8 address)</label>
                  <input
                    type="text"
                    value={reqToken}
                    onChange={(e) => setReqToken(e.target.value)}
                    placeholder="0x..."
                    className={inputClass + " mt-1 font-mono text-xs"}
                  />
                </div>
                <div>
                  <label className={labelClass}>Min token balance</label>
                  <input
                    type="number"
                    value={reqTokenAmount}
                    onChange={(e) => setReqTokenAmount(e.target.value)}
                    placeholder="0"
                    className={inputClass + " mt-1"}
                  />
                </div>
                <div>
                  <label className={labelClass}>Min followers (LSP26)</label>
                  <input
                    type="number"
                    value={reqFollowers}
                    onChange={(e) => setReqFollowers(e.target.value)}
                    placeholder="0"
                    className={inputClass + " mt-1"}
                  />
                </div>
                <button
                  onClick={() => {
                    const token = reqToken || "0x0000000000000000000000000000000000000000";
                    sendTx((c) => c.setRequirements(token, reqTokenAmount || "0", reqFollowers || "0"), "Updating requirements...");
                  }}
                  className={btnClass}
                >
                  Update Requirements
                </button>
              </div>
            </div>
          </>
        )}

        {/* Status toast */}
        {status && (
          <div className={`px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl text-xs sm:text-sm ${
            status.type === "success"
              ? "bg-green-500/10 border border-green-500/20 text-green-400"
              : status.type === "error"
              ? "bg-red-500/10 border border-red-500/20 text-red-400"
              : "bg-purple-500/10 border border-purple-500/20 text-purple-400"
          }`}>
            {status.message}
          </div>
        )}

        <div className="flex justify-between items-center px-2 pb-4">
          <a href="/" className="text-zinc-600 text-[10px] sm:text-xs hover:text-purple-400 transition-colors">
            ← Claim page
          </a>
          <p className="text-zinc-600 text-[10px] sm:text-xs">
            Powered by{" "}
            <a href="https://lukso.network" target="_blank" className="text-purple-400 hover:underline">LUKSO</a>
          </p>
        </div>
      </div>
    </div>
  );
}
