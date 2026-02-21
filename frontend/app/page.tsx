"use client";

import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits } from "ethers";
import { fetchProfile, ProfileInfo } from "./lib/profile";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
const TOKEN_TYPE = process.env.NEXT_PUBLIC_TOKEN_TYPE || "LSP8";
const LUKSO_RPC = "https://rpc.mainnet.lukso.network";
const LUKSO_CHAIN_ID = "0x2a";

function getProvider() {
  if (typeof window === "undefined") return null;
  return (window as any).lukso || (window as any).ethereum || null;
}

const SHARED_ABI = [
  "function claim() external",
  "function claimEnabled() view returns (bool)",
  "function startTime() view returns (uint256)",
  "function endTime() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function isClaimActive() view returns (bool)",
  "function hasClaimed(address) view returns (bool)",
  "function name() view returns (string)",
  "function amountPerClaim() view returns (uint256)",
  "function requiredToken() view returns (address)",
  "function requiredTokenAmount() view returns (uint256)",
  "function requiredFollowers() view returns (uint256)",
  "function meetsRequirements(address) view returns (bool tokenOk, bool followersOk)",
];

const LSP8_ABI = [...SHARED_ABI, "function totalClaimed() view returns (uint256)"];
const LSP7_ABI = [
  ...SHARED_ABI,
  "function totalClaimedAmount() view returns (uint256)",
  "function totalClaimers() view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const TOKEN_NAME_ABI = ["function name() view returns (string)"];

type Status = { message: string; type: "success" | "error" | "loading" } | null;

interface Requirements {
  token: string;
  tokenAmount: bigint;
  tokenName: string;
  followers: bigint;
}

interface UserEligibility {
  tokenOk: boolean;
  followersOk: boolean;
}

const ZERO = "0x0000000000000000000000000000000000000000";

export default function ClaimPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [dropName, setDropName] = useState("Loading...");
  const [claimedDisplay, setClaimedDisplay] = useState("-");
  const [supplyDisplay, setSupplyDisplay] = useState("-");
  const [amountDisplay, setAmountDisplay] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [claiming, setClaiming] = useState(false);
  const [requirements, setRequirements] = useState<Requirements | null>(null);
  const [eligibility, setEligibility] = useState<UserEligibility | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);

  const abi = TOKEN_TYPE === "LSP7" ? LSP7_ABI : LSP8_ABI;
  const isLSP7 = TOKEN_TYPE === "LSP7";

  const loadState = useCallback(
    async (userAddress?: string) => {
      if (!CONTRACT_ADDRESS) {
        setDropName("Token Claimer");
        return;
      }
      const rpc = new JsonRpcProvider(LUKSO_RPC);
      const contract = new Contract(CONTRACT_ADDRESS, abi, rpc);

      try {
        const [name, supply, active, amount, reqToken, reqAmount, reqFollowers] =
          await Promise.all([
            contract.name(),
            contract.maxSupply(),
            contract.isClaimActive(),
            contract.amountPerClaim(),
            contract.requiredToken(),
            contract.requiredTokenAmount(),
            contract.requiredFollowers(),
          ]);

        setDropName(name);
        setIsActive(active);

        let tokenName = "";
        if (reqToken !== ZERO && reqAmount > BigInt(0)) {
          try {
            const tc = new Contract(reqToken, TOKEN_NAME_ABI, rpc);
            tokenName = await tc.name();
          } catch {
            tokenName = `${reqToken.slice(0, 6)}...${reqToken.slice(-4)}`;
          }
        }

        const hasReqs = (reqToken !== ZERO && reqAmount > BigInt(0)) || reqFollowers > BigInt(0);
        setRequirements(
          hasReqs ? { token: reqToken, tokenAmount: reqAmount, tokenName, followers: reqFollowers } : null
        );

        if (isLSP7) {
          const [totalAmount, claimers, decimals] = await Promise.all([
            contract.totalClaimedAmount(),
            contract.totalClaimers(),
            contract.decimals(),
          ]);
          const dec = Number(decimals);
          setClaimedDisplay(claimers.toString());
          setSupplyDisplay(supply === BigInt(0) ? "\u221e" : formatUnits(supply, dec));
          setAmountDisplay(formatUnits(amount, dec) + " tokens");
        } else {
          const totalClaimed = await contract.totalClaimed();
          setClaimedDisplay(totalClaimed.toString());
          setSupplyDisplay(supply === BigInt(0) ? "\u221e" : supply.toString());
          setAmountDisplay(amount.toString() + (amount === BigInt(1) ? " NFT" : " NFTs"));
        }

        if (userAddress) {
          const [claimed, meets] = await Promise.all([
            contract.hasClaimed(userAddress),
            hasReqs
              ? contract.meetsRequirements(userAddress)
              : Promise.resolve({ tokenOk: true, followersOk: true }),
          ]);
          setAlreadyClaimed(claimed);
          setEligibility({ tokenOk: meets.tokenOk, followersOk: meets.followersOk });
        }
      } catch (e) {
        console.error("Failed to load contract:", e);
        setDropName("Token Claimer");
      }
    },
    [abi, isLSP7]
  );

  useEffect(() => {
    loadState();
  }, [loadState]);

  async function ensureLuksoNetwork() {
    const p = getProvider();
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
  }

  async function connect() {
    const p = getProvider();
    if (!p) {
      setStatus({ message: "Install the Universal Profile Browser Extension", type: "error" });
      return;
    }
    try {
      setStatus({ message: "Connecting...", type: "loading" });
      await ensureLuksoNetwork();
      const accounts = await p.request({ method: "eth_requestAccounts" });
      setAddress(accounts[0]);
      setStatus(null);
      await loadState(accounts[0]);
      fetchProfile(accounts[0]).then(setProfile);
    } catch (e: any) {
      setStatus({ message: e.message || "Failed to connect", type: "error" });
    }
  }

  async function claim() {
    const p = getProvider();
    if (!p || !address) return;
    try {
      setClaiming(true);
      setStatus({ message: "Confirming transaction...", type: "loading" });
      const provider = new BrowserProvider(p);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, abi, signer);
      const tx = await contract.claim();
      setStatus({ message: "Transaction sent! Waiting for confirmation...", type: "loading" });
      await tx.wait();
      setStatus({
        message: isLSP7
          ? "\ud83c\udf89 Tokens Claimed! Check your Universal Profile"
          : "\ud83c\udf89 NFT Claimed! Check your Universal Profile",
        type: "success",
      });
      setAlreadyClaimed(true);
      await loadState(address);
    } catch (e: any) {
      setStatus({ message: e.reason || e.message?.slice(0, 100) || "Transaction failed", type: "error" });
    } finally {
      setClaiming(false);
    }
  }

  const canClaim =
    isActive && !alreadyClaimed && !claiming &&
    (!eligibility || (eligibility.tokenOk && eligibility.followersOk));

  return (
    <div className="min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4">
      <div className="max-w-md w-full">
        <div className="bg-[#12121a] rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-center border border-purple-500/10">
          {/* Artwork */}
          <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-xl sm:rounded-2xl mx-auto mb-4 sm:mb-6 bg-gradient-to-br from-violet-600 to-purple-400 flex items-center justify-center text-4xl sm:text-6xl">
            {isLSP7 ? "\ud83e\ude99" : "\ud83c\udfb5"}
          </div>

          <h1 className="text-xl sm:text-2xl font-bold mb-1">{dropName}</h1>

          {/* Connected profile */}
          {address && profile ? (
            <div className="flex items-center justify-center gap-2 mb-2">
              {profile.image && (
                <img
                  src={profile.image}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover"
                />
              )}
              <span className="text-zinc-300 text-xs sm:text-sm font-medium">
                {profile.name || `${address.slice(0, 6)}...${address.slice(-4)}`}
              </span>
            </div>
          ) : (
            <p className="text-zinc-500 mb-2 text-xs sm:text-sm">
              {address
                ? `${address.slice(0, 6)}...${address.slice(-4)}`
                : "Connect your Universal Profile to claim"}
            </p>
          )}

          {/* Amount badge */}
          {amountDisplay && (
            <div className="inline-block bg-purple-500/10 border border-purple-500/20 text-purple-400 px-3 py-1 rounded-full text-xs font-medium mb-4">
              {amountDisplay} per claim
            </div>
          )}

          {/* Requirements */}
          {requirements && (
            <div className="bg-zinc-800/50 rounded-xl p-3 sm:p-4 mb-4 text-left text-xs sm:text-sm">
              <div className="text-zinc-400 text-[10px] sm:text-xs uppercase tracking-wider mb-2 text-center font-medium">
                Requirements
              </div>
              {requirements.token !== ZERO && requirements.tokenAmount > BigInt(0) && (
                <div className="flex items-center justify-between py-1 gap-2">
                  <span className="text-zinc-300 break-words min-w-0">
                    Hold {requirements.tokenAmount.toString()} {requirements.tokenName}
                  </span>
                  {eligibility && (
                    <span className={`flex-shrink-0 ${eligibility.tokenOk ? "text-green-400" : "text-red-400"}`}>
                      {eligibility.tokenOk ? "\u2713" : "\u2717"}
                    </span>
                  )}
                </div>
              )}
              {requirements.followers > BigInt(0) && (
                <div className="flex items-center justify-between py-1 gap-2">
                  <span className="text-zinc-300">
                    {requirements.followers.toString()}+ followers
                  </span>
                  {eligibility && (
                    <span className={`flex-shrink-0 ${eligibility.followersOk ? "text-green-400" : "text-red-400"}`}>
                      {eligibility.followersOk ? "\u2713" : "\u2717"}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Inactive banner */}
          {!isActive && CONTRACT_ADDRESS && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl mb-4 sm:mb-6 text-xs sm:text-sm">
              Claim is not active right now
            </div>
          )}

          {/* Stats */}
          <div className="flex justify-center gap-8 sm:gap-12 mb-6 sm:mb-8">
            <div>
              <div className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider">Claimers</div>
              <div className="text-lg sm:text-xl font-semibold text-purple-400">{claimedDisplay}</div>
            </div>
            <div>
              <div className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider">Max Supply</div>
              <div className="text-lg sm:text-xl font-semibold text-purple-400">{supplyDisplay}</div>
            </div>
          </div>

          {/* Buttons */}
          {!address ? (
            <button
              onClick={connect}
              className="w-full py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-base sm:text-lg font-semibold border-2 border-purple-400 text-purple-400 hover:bg-purple-400/10 transition-all cursor-pointer active:scale-[0.97]"
            >
              Connect Universal Profile
            </button>
          ) : alreadyClaimed ? (
            <button
              disabled
              className="w-full py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-base sm:text-lg font-semibold bg-purple-400/50 text-white cursor-not-allowed"
            >
              Already Claimed \u2713
            </button>
          ) : (
            <button
              onClick={claim}
              disabled={!canClaim}
              className="w-full py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-base sm:text-lg font-semibold bg-purple-400 text-white hover:bg-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.97]"
            >
              {claiming
                ? "Claiming..."
                : !eligibility || (eligibility.tokenOk && eligibility.followersOk)
                ? isLSP7 ? "Claim Tokens" : "Claim NFT"
                : "Requirements not met"}
            </button>
          )}

          {/* Status */}
          {status && (
            <div className={`mt-3 sm:mt-4 px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl text-xs sm:text-sm ${
              status.type === "success"
                ? "bg-green-500/10 border border-green-500/20 text-green-400"
                : status.type === "error"
                ? "bg-red-500/10 border border-red-500/20 text-red-400"
                : "bg-purple-500/10 border border-purple-500/20 text-purple-400"
            }`}>
              {status.message}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center mt-4 sm:mt-6 px-2">
          <p className="text-zinc-600 text-[10px] sm:text-xs">
            Powered by{" "}
            <a href="https://lukso.network" target="_blank" className="text-purple-400 hover:underline">LUKSO</a>
          </p>
          <a href="/admin" className="text-zinc-600 text-[10px] sm:text-xs hover:text-purple-400 transition-colors">
            Admin →
          </a>
        </div>
      </div>
    </div>
  );
}
