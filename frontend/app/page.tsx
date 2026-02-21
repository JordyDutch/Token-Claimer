"use client";

import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
const LUKSO_RPC = "https://rpc.mainnet.lukso.network";
const LUKSO_CHAIN_ID = "0x2a"; // 42

const ABI = [
  "function claim() external",
  "function claimEnabled() view returns (bool)",
  "function startTime() view returns (uint256)",
  "function endTime() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function totalClaimed() view returns (uint256)",
  "function isClaimActive() view returns (bool)",
  "function hasClaimed(address) view returns (bool)",
  "function name() view returns (string)",
  "function owner() view returns (address)",
  "event NFTClaimed(address indexed claimer, bytes32 tokenId)",
];

type Status = { message: string; type: "success" | "error" | "loading" } | null;

export default function ClaimPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [dropName, setDropName] = useState("Loading...");
  const [totalClaimed, setTotalClaimed] = useState("-");
  const [maxSupply, setMaxSupply] = useState("-");
  const [isActive, setIsActive] = useState(false);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [claiming, setClaiming] = useState(false);

  // Load read-only state
  useEffect(() => {
    if (!CONTRACT_ADDRESS) {
      setDropName("Token Claimer");
      return;
    }
    const rpc = new JsonRpcProvider(LUKSO_RPC);
    const contract = new Contract(CONTRACT_ADDRESS, ABI, rpc);

    (async () => {
      try {
        const [name, claimed, supply, active] = await Promise.all([
          contract.name(),
          contract.totalClaimed(),
          contract.maxSupply(),
          contract.isClaimActive(),
        ]);
        setDropName(name);
        setTotalClaimed(claimed.toString());
        setMaxSupply(supply === BigInt(0) ? "∞" : supply.toString());
        setIsActive(active);
      } catch (e) {
        console.error("Failed to load contract:", e);
        setDropName("Token Claimer");
      }
    })();
  }, []);

  // Refresh state after connect
  const refreshState = useCallback(
    async (userAddress: string) => {
      if (!CONTRACT_ADDRESS) return;
      const rpc = new JsonRpcProvider(LUKSO_RPC);
      const contract = new Contract(CONTRACT_ADDRESS, ABI, rpc);
      try {
        const [name, claimed, supply, active, hasClaimed] = await Promise.all([
          contract.name(),
          contract.totalClaimed(),
          contract.maxSupply(),
          contract.isClaimActive(),
          contract.hasClaimed(userAddress),
        ]);
        setDropName(name);
        setTotalClaimed(claimed.toString());
        setMaxSupply(supply === BigInt(0) ? "∞" : supply.toString());
        setIsActive(active);
        setAlreadyClaimed(hasClaimed);
      } catch (e) {
        console.error("Failed to refresh:", e);
      }
    },
    []
  );

  async function ensureLuksoNetwork() {
    const ethereum = (window as any).ethereum;
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: LUKSO_CHAIN_ID }],
      });
    } catch (e: any) {
      if (e.code === 4902) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: LUKSO_CHAIN_ID,
              chainName: "LUKSO",
              nativeCurrency: { name: "LYX", symbol: "LYX", decimals: 18 },
              rpcUrls: [LUKSO_RPC],
              blockExplorerUrls: [
                "https://explorer.execution.mainnet.lukso.network",
              ],
            },
          ],
        });
      }
    }
  }

  async function connect() {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setStatus({
        message: "Install the UP Browser Extension to continue",
        type: "error",
      });
      return;
    }
    try {
      setStatus({ message: "Connecting...", type: "loading" });
      await ensureLuksoNetwork();
      const accounts = await ethereum.request({
        method: "eth_requestAccounts",
      });
      setAddress(accounts[0]);
      setStatus(null);
      await refreshState(accounts[0]);
    } catch (e: any) {
      setStatus({ message: e.message || "Failed to connect", type: "error" });
    }
  }

  async function claim() {
    const ethereum = (window as any).ethereum;
    if (!ethereum || !address) return;

    try {
      setClaiming(true);
      setStatus({ message: "Confirming transaction...", type: "loading" });

      const provider = new BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const tx = await contract.claim();
      setStatus({
        message: "Transaction sent! Waiting for confirmation...",
        type: "loading",
      });

      await tx.wait();
      setStatus({
        message: "🎉 NFT Claimed! Check your Universal Profile",
        type: "success",
      });
      setAlreadyClaimed(true);
      await refreshState(address);
    } catch (e: any) {
      const msg = e.reason || e.message?.slice(0, 100) || "Transaction failed";
      setStatus({ message: msg, type: "error" });
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-[#12121a] rounded-3xl p-8 text-center border border-purple-500/10">
          {/* Artwork */}
          <div className="w-48 h-48 rounded-2xl mx-auto mb-6 bg-gradient-to-br from-violet-600 to-purple-400 flex items-center justify-center text-6xl">
            🎵
          </div>

          <h1 className="text-2xl font-bold mb-1">{dropName}</h1>
          <p className="text-zinc-500 mb-6 text-sm">
            {address
              ? `${address.slice(0, 6)}...${address.slice(-4)}`
              : "Connect your Universal Profile to claim"}
          </p>

          {/* Inactive banner */}
          {!isActive && CONTRACT_ADDRESS && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl mb-6 text-sm">
              Claim is not active right now
            </div>
          )}

          {/* Stats */}
          <div className="flex justify-center gap-12 mb-8">
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider">
                Claimed
              </div>
              <div className="text-xl font-semibold text-purple-400">
                {totalClaimed}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider">
                Supply
              </div>
              <div className="text-xl font-semibold text-purple-400">
                {maxSupply}
              </div>
            </div>
          </div>

          {/* Buttons */}
          {!address ? (
            <button
              onClick={connect}
              className="w-full py-4 rounded-2xl text-lg font-semibold border-2 border-purple-400 text-purple-400 hover:bg-purple-400/10 transition-all cursor-pointer"
            >
              Connect Universal Profile
            </button>
          ) : alreadyClaimed ? (
            <button
              disabled
              className="w-full py-4 rounded-2xl text-lg font-semibold bg-purple-400/50 text-white cursor-not-allowed"
            >
              Already Claimed ✓
            </button>
          ) : (
            <button
              onClick={claim}
              disabled={!isActive || claiming}
              className="w-full py-4 rounded-2xl text-lg font-semibold bg-purple-400 text-white hover:bg-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:-translate-y-0.5"
            >
              {claiming ? "Claiming..." : "Claim NFT"}
            </button>
          )}

          {/* Status */}
          {status && (
            <div
              className={`mt-4 px-4 py-3 rounded-xl text-sm ${
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
        </div>

        <p className="text-center mt-6 text-zinc-600 text-xs">
          Powered by{" "}
          <a
            href="https://lukso.network"
            target="_blank"
            className="text-purple-400 hover:underline"
          >
            LUKSO
          </a>
        </p>
      </div>
    </div>
  );
}
