"use client";

import { useState, useEffect } from "react";
import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
const TOKEN_TYPE = process.env.NEXT_PUBLIC_TOKEN_TYPE || "LSP8";
const LUKSO_RPC = "https://rpc.mainnet.lukso.network";
const LUKSO_CHAIN_ID = "0x2a";

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
  // LSP8
  "function totalClaimed() view returns (uint256)",
  // LSP7
  "function totalClaimedAmount() view returns (uint256)",
  "function totalClaimers() view returns (uint256)",
];

type Status = { message: string; type: "success" | "error" | "loading" } | null;

export default function AdminPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  // Contract state
  const [dropName, setDropName] = useState("");
  const [claimEnabled, setClaimEnabled] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [amountPerClaim, setAmountPerClaim] = useState("");
  const [totalClaimed, setTotalClaimed] = useState("0");
  const [maxSupply, setMaxSupply] = useState("0");

  // Requirements
  const [reqToken, setReqToken] = useState("");
  const [reqTokenAmount, setReqTokenAmount] = useState("");
  const [reqFollowers, setReqFollowers] = useState("");

  const isLSP7 = TOKEN_TYPE === "LSP7";

  async function connect() {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setStatus({ message: "Install UP Browser Extension", type: "error" });
      return;
    }
    try {
      setStatus({ message: "Connecting...", type: "loading" });
      try {
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: LUKSO_CHAIN_ID }],
        });
      } catch (e: any) {
        if (e.code === 4902) {
          await ethereum.request({
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
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      setAddress(accounts[0]);
      setStatus(null);
      await loadState(accounts[0]);
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

      // Time display
      if (start > BigInt(0)) {
        setStartTime(new Date(Number(start) * 1000).toISOString().slice(0, 16));
      }
      if (end > BigInt(0)) {
        setEndTime(new Date(Number(end) * 1000).toISOString().slice(0, 16));
      }

      // Stats
      try {
        if (isLSP7) {
          const claimers = await contract.totalClaimers();
          setTotalClaimed(claimers.toString());
        } else {
          const claimed = await contract.totalClaimed();
          setTotalClaimed(claimed.toString());
        }
      } catch {
        setTotalClaimed("?");
      }
    } catch (e) {
      console.error("Failed to load state:", e);
    }
  }

  async function sendTx(fn: (contract: Contract) => Promise<any>, msg: string) {
    const ethereum = (window as any).ethereum;
    if (!ethereum || !address) return;
    try {
      setStatus({ message: msg, type: "loading" });
      const provider = new BrowserProvider(ethereum);
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

  async function toggleClaim() {
    await sendTx(
      (c) => c.setClaimEnabled(!claimEnabled),
      claimEnabled ? "Disabling claims..." : "Enabling claims..."
    );
  }

  async function updateWindow() {
    const start = startTime ? Math.floor(new Date(startTime).getTime() / 1000) : 0;
    const end = endTime ? Math.floor(new Date(endTime).getTime() / 1000) : 0;
    await sendTx((c) => c.setClaimWindow(start, end), "Setting claim window...");
  }

  async function updateAmount() {
    await sendTx(
      (c) => c.setAmountPerClaim(amountPerClaim),
      "Updating amount per claim..."
    );
  }

  async function updateRequirements() {
    const token = reqToken || "0x0000000000000000000000000000000000000000";
    const amount = reqTokenAmount || "0";
    const followers = reqFollowers || "0";
    await sendTx(
      (c) => c.setRequirements(token, amount, followers),
      "Updating requirements..."
    );
  }

  if (!CONTRACT_ADDRESS) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-[#12121a] rounded-3xl p-8 text-center border border-purple-500/10 max-w-md">
          <h1 className="text-2xl font-bold mb-4">Admin Panel</h1>
          <p className="text-zinc-400">Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-4">
        {/* Header */}
        <div className="bg-[#12121a] rounded-3xl p-6 border border-purple-500/10">
          <h1 className="text-2xl font-bold mb-1">Admin Panel</h1>
          <p className="text-zinc-500 text-sm">{dropName || CONTRACT_ADDRESS}</p>

          {!address ? (
            <button
              onClick={connect}
              className="mt-4 w-full py-3 rounded-xl text-sm font-semibold border-2 border-purple-400 text-purple-400 hover:bg-purple-400/10 transition-all cursor-pointer"
            >
              Connect Universal Profile
            </button>
          ) : !isOwner ? (
            <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">
              Connected wallet is not the contract owner
            </div>
          ) : (
            <p className="text-green-400 text-xs mt-2">
              ✓ Connected as owner
            </p>
          )}
        </div>

        {address && isOwner && (
          <>
            {/* Stats */}
            <div className="bg-[#12121a] rounded-3xl p-6 border border-purple-500/10">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Status</div>
                  <div className={`text-lg font-semibold ${claimEnabled ? "text-green-400" : "text-red-400"}`}>
                    {claimEnabled ? "Live" : "Paused"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Claimed</div>
                  <div className="text-lg font-semibold text-purple-400">{totalClaimed}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Supply</div>
                  <div className="text-lg font-semibold text-purple-400">
                    {maxSupply === "0" ? "\u221e" : maxSupply}
                  </div>
                </div>
              </div>

              <button
                onClick={toggleClaim}
                className={`mt-4 w-full py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  claimEnabled
                    ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                    : "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
                }`}
              >
                {claimEnabled ? "Pause Claims" : "Enable Claims"}
              </button>
            </div>

            {/* Time Window */}
            <div className="bg-[#12121a] rounded-3xl p-6 border border-purple-500/10">
              <h2 className="text-sm font-semibold text-zinc-300 mb-3">Claim Window</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-500">Start (leave empty = immediate)</label>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-purple-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">End (leave empty = no end)</label>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-purple-400"
                  />
                </div>
                <button
                  onClick={updateWindow}
                  className="w-full py-2 rounded-xl text-sm font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-all cursor-pointer"
                >
                  Set Window
                </button>
              </div>
            </div>

            {/* Amount Per Claim */}
            <div className="bg-[#12121a] rounded-3xl p-6 border border-purple-500/10">
              <h2 className="text-sm font-semibold text-zinc-300 mb-3">
                {isLSP7 ? "Tokens" : "NFTs"} Per Claim
              </h2>
              <input
                type="number"
                value={amountPerClaim}
                onChange={(e) => setAmountPerClaim(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-purple-400"
                min="1"
              />
              <button
                onClick={updateAmount}
                className="mt-3 w-full py-2 rounded-xl text-sm font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-all cursor-pointer"
              >
                Update Amount
              </button>
            </div>

            {/* Requirements */}
            <div className="bg-[#12121a] rounded-3xl p-6 border border-purple-500/10">
              <h2 className="text-sm font-semibold text-zinc-300 mb-3">Requirements (optional)</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-500">Required token (LSP7/LSP8 address)</label>
                  <input
                    type="text"
                    value={reqToken}
                    onChange={(e) => setReqToken(e.target.value)}
                    placeholder="0x..."
                    className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-purple-400 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Min token balance</label>
                  <input
                    type="number"
                    value={reqTokenAmount}
                    onChange={(e) => setReqTokenAmount(e.target.value)}
                    placeholder="0"
                    className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-purple-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Min followers (LSP26)</label>
                  <input
                    type="number"
                    value={reqFollowers}
                    onChange={(e) => setReqFollowers(e.target.value)}
                    placeholder="0"
                    className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-purple-400"
                  />
                </div>
                <button
                  onClick={updateRequirements}
                  className="w-full py-2 rounded-xl text-sm font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-all cursor-pointer"
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
            className={`px-4 py-3 rounded-xl text-sm ${
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

        <p className="text-center text-zinc-600 text-xs pb-4">
          <a href="/" className="text-purple-400 hover:underline">
            ← Back to claim page
          </a>
        </p>
      </div>
    </div>
  );
}
