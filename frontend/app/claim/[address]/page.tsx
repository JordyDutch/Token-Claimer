"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits, Interface, id } from "ethers";
import {
  CLAIM_ABI, LSP7_EXTRA_ABI, LSP8_EXTRA_ABI, ZERO,
  LSP4_TOKEN_NAME_KEY, LSP4_TOKEN_SYMBOL_KEY,
  getProvider, detectTokenType,
} from "../../lib/contracts";
import { fetchProfile, ProfileInfo } from "../../lib/profile";
import { LSP4_METADATA_KEY } from "../../lib/lsp4";
import { fetchAssetByAddress, getEnvioEndpoint } from "../../lib/envio";
import Link from "next/link";
import CopyButton from "../../components/CopyButton";
import Footer from "../../components/Footer";
import { useWallet } from "../../components/WalletProvider";
import { useNetwork } from "../../components/NetworkProvider";
import { useUPProvider } from "../../components/UPProviderInit";

/* ---------- Event topics for claimers list ---------- */
const TOPIC_TOKEN_CLAIMED = id("TokensClaimed(address,uint256)");
const TOPIC_NFT_CLAIMED = id("NFTsClaimed(address,uint256,uint256)");
const claimIface = new Interface([
  "event TokensClaimed(address indexed claimer, uint256 amount)",
  "event NFTsClaimed(address indexed claimer, uint256 firstTokenId, uint256 amount)",
]);

interface ClaimerInfo {
  address: string;
  blockNumber: number;
  timestamp: number;
  profile?: ProfileInfo | null;
}

function timeSince(timestamp: number): string {
  if (!timestamp) return "";
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

type Status = { message: string; type: "success" | "error" | "loading" } | null;

export default function ClaimPage() {
  const params = useParams();
  const contractAddress = params.address as string;
  const { address, profile, connect: walletConnect, disconnect } = useWallet();
  const { config: networkConfig, networkId } = useNetwork();
  const { inIframe } = useUPProvider();

  const [creatorProfile, setCreatorProfile] = useState<ProfileInfo | null>(null);
  const [dropName, setDropName] = useState("Loading...");
  const [dropSymbol, setDropSymbol] = useState("");
  const [dropIcon, setDropIcon] = useState<string | null>(null);
  const [tokenType, setTokenType] = useState<"LSP7" | "LSP8" | null>(null);
  const [isNftStyle, setIsNftStyle] = useState(false);
  const [claimedDisplay, setClaimedDisplay] = useState("-");
  const [supplyDisplay, setSupplyDisplay] = useState("-");
  const [amountDisplay, setAmountDisplay] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [claimEnabled, setClaimEnabled] = useState(false);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [claiming, setClaiming] = useState(false);
  const [reqInfo, setReqInfo] = useState<{
    tokens: { addr: string; amount: bigint; name: string; symbol: string; icon: string | null }[];
    followers: bigint;
  } | null>(null);
  const [eligibility, setEligibility] = useState<{ tokenOk: boolean; followersOk: boolean } | null>(null);
  const [tokenMet, setTokenMet] = useState<boolean[]>([]);
  const [owner, setOwner] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const [pageLoading, setPageLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [codewordRequired, setCodewordRequired] = useState(false);
  const [codewordInput, setCodewordInput] = useState("");
  const [claimers, setClaimers] = useState<ClaimerInfo[]>([]);
  const [claimersLoading, setClaimersLoading] = useState(true);
  const [showAllClaimers, setShowAllClaimers] = useState(false);
  const claimersVersion = useRef(0);

  const loadState = useCallback(async (userAddr?: string) => {
    if (!contractAddress) return;
    const rpc = new JsonRpcProvider(networkConfig.rpc);
    const abi = [...CLAIM_ABI, ...LSP7_EXTRA_ABI, ...LSP8_EXTRA_ABI];
    const c = new Contract(contractAddress, abi, rpc);

    try {
      const type = await detectTokenType(c);
      setTokenType(type);

      const safe = (p: Promise<any>, fallback: any = null) => p.catch(() => fallback);
      // LSP7/LSP8 v0.16+ store name/symbol in ERC725Y — no name()/symbol() view functions
      const decodeBytes = (raw: Uint8Array | string | null): string => {
        if (!raw) return "";
        try {
          const bytes = typeof raw === "string"
            ? Uint8Array.from(Buffer.from(raw.replace(/^0x/, ""), "hex"))
            : raw;
          return new TextDecoder().decode(bytes);
        } catch { return ""; }
      };
      const [nameRaw, symbolRaw, supply, active, enabled, amount, reqResult, rFollowers, ownerAddr, start, end, codeEnabled] = await Promise.all([
        safe(c.getData(LSP4_TOKEN_NAME_KEY), null),
        safe(c.getData(LSP4_TOKEN_SYMBOL_KEY), null),
        safe(c.maxSupply(), BigInt(0)),
        safe(c.isClaimActive(), false),
        safe(c.claimEnabled(), false),
        safe(c.amountPerClaim(), BigInt(0)),
        safe(c.getTokenRequirements(), { tokens: [], minBalances: [] }),
        safe(c.requiredFollowers(), BigInt(0)),
        safe(c.owner(), ZERO),
        safe(c.startTime(), BigInt(0)),
        safe(c.endTime(), BigInt(0)),
        safe(c.codewordEnabled(), false),
      ]);
      setCodewordRequired(Boolean(codeEnabled));
      setDropName(decodeBytes(nameRaw) || "Unknown");
      setDropSymbol(decodeBytes(symbolRaw));

      // Load LSP4Metadata icon (fire-and-forget, non-blocking)
      safe(c.getData(LSP4_METADATA_KEY), null).then(async (metaRaw: string | null) => {
        if (!metaRaw || metaRaw === "0x" || metaRaw.length < 10) return;
        try {
          const bytes = Buffer.from(metaRaw.replace(/^0x/, ""), "hex");
          const text = bytes.toString("utf8");
          const idx = text.indexOf("ipfs://");
          if (idx === -1) return;
          const cid = text.slice(idx).replace("ipfs://", "");
          const res = await fetch(`https://api.universalprofile.cloud/ipfs/${cid}`);
          if (!res.ok) return;
          const json = await res.json();
          const icon = json?.LSP4Metadata?.images?.[0]?.[0]?.url
            ?? json?.LSP4Metadata?.icon?.[0]?.url;
          if (icon) {
            if (icon.startsWith("https://") || icon.startsWith("http://")) {
              setDropIcon(icon);
            } else {
              setDropIcon(`https://api.universalprofile.cloud/ipfs/${icon.replace("ipfs://", "")}`);
            }
          }
        } catch { /* no icon, keep fallback */ }
      });
      setIsActive(active);
      setClaimEnabled(enabled);
      setOwner(ownerAddr);
      setStartTime(Number(start));
      setEndTime(Number(end));
      fetchProfile(ownerAddr).then(setCreatorProfile).catch(() => {});

      // Build multi-token requirements list
      const rawTokens: string[] = reqResult?.tokens ?? [];
      const rawBalances: bigint[] = reqResult?.minBalances ?? [];
      const tokenEntries = rawTokens
        .map((addr: string, i: number) => ({ addr, amount: rawBalances[i] ?? BigInt(0) }))
        .filter((e: { addr: string; amount: bigint }) => e.addr !== ZERO);

      const enrichedTokens = await Promise.all(
        tokenEntries.map(async (e: { addr: string; amount: bigint }) => {
          const asset = await fetchAssetByAddress(e.addr, getEnvioEndpoint(networkId)).catch(() => null);
          return {
            addr: e.addr,
            amount: e.amount,
            name: asset?.lsp4TokenName || `${e.addr.slice(0, 6)}...${e.addr.slice(-4)}`,
            symbol: asset?.lsp4TokenSymbol || "",
            icon: asset?.icon || null,
          };
        })
      );

      const hasReqs = enrichedTokens.length > 0 || rFollowers > BigInt(0);
      setReqInfo(hasReqs ? { tokens: enrichedTokens, followers: rFollowers } : null);

      if (type === "LSP7") {
        const [, claimers, decimals] = await Promise.all([
          c.totalClaimedAmount().catch(() => BigInt(0)),
          c.totalClaimers().catch(() => BigInt(0)),
          c.decimals(),
        ]);
        const dec = Number(decimals);
        const nft = dec === 0;
        setIsNftStyle(nft);
        setClaimedDisplay(claimers.toString());
        if (nft) {
          setSupplyDisplay(supply === BigInt(0) ? "Unlimited" : supply.toString());
          setAmountDisplay(amount.toString() + (amount === BigInt(1) ? " NFT" : " NFTs"));
        } else {
          setSupplyDisplay(supply === BigInt(0) ? "Unlimited" : formatUnits(supply, dec));
          setAmountDisplay(formatUnits(amount, dec) + " tokens");
        }
      } else {
        setIsNftStyle(true);
        const totalClaimed = await c.totalClaimed().catch(() => BigInt(0));
        setClaimedDisplay(totalClaimed.toString());
        setSupplyDisplay(supply === BigInt(0) ? "Unlimited" : supply.toString());
        setAmountDisplay(amount.toString() + (amount === BigInt(1) ? " NFT" : " NFTs"));
      }

      if (userAddr) {
        const [claimed, meets] = await Promise.all([
          c.hasClaimed(userAddr),
          hasReqs ? c.meetsRequirements(userAddr) : Promise.resolve({ tokenOk: true, followersOk: true } as any),
        ]);
        setAlreadyClaimed(claimed);
        setEligibility({ tokenOk: meets.tokenOk, followersOk: meets.followersOk });

        // Check each token requirement individually
        if (enrichedTokens.length > 0) {
          const balanceAbi = ["function balanceOf(address) view returns (uint256)"];
          const perToken = await Promise.all(
            enrichedTokens.map(async (t) => {
              try {
                const tokenContract = new Contract(t.addr, balanceAbi, rpc);
                const balance: bigint = await tokenContract.balanceOf(userAddr);
                return t.amount > BigInt(0) ? balance >= t.amount : balance > BigInt(0);
              } catch {
                return false;
              }
            })
          );
          setTokenMet(perToken);
        } else {
          setTokenMet([]);
        }
      }
    } catch (e) {
      console.error("Load error:", e);
      setDropName("Unknown Drop");
    } finally {
      setPageLoading(false);
    }
  }, [contractAddress, networkConfig]);

  // Load contract state on mount, reload when wallet connects or network changes
  useEffect(() => { loadState(address ?? undefined); }, [loadState, address]);

  // Fetch claimers list from on-chain events
  const loadClaimers = useCallback(async () => {
    if (!contractAddress) return;
    const version = ++claimersVersion.current;
    setClaimersLoading(true);
    const rpc = new JsonRpcProvider(networkConfig.rpc);
    try {
      const currentBlock = await rpc.getBlockNumber();
      // Fetch all claim events for this contract (scan last ~600k blocks ≈ 35 days)
      const fromBlock = Math.max(0, currentBlock - 600_000);
      const logs: any[] = await rpc.send("eth_getLogs", [{
        address: [contractAddress],
        topics: [[TOPIC_TOKEN_CLAIMED, TOPIC_NFT_CLAIMED]],
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: "latest",
      }]);
      if (version !== claimersVersion.current) return;

      // Parse logs → claimer entries
      const parsed: ClaimerInfo[] = [];
      for (const log of logs) {
        try {
          const p = claimIface.parseLog({ topics: log.topics, data: log.data });
          if (!p) continue;
          parsed.push({
            address: p.args[0],
            blockNumber: parseInt(log.blockNumber, 16),
            timestamp: 0,
          });
        } catch { /* skip */ }
      }

      // Deduplicate by address, keep most recent
      const byAddr = new Map<string, ClaimerInfo>();
      for (const c of parsed) {
        const key = c.address.toLowerCase();
        const existing = byAddr.get(key);
        if (!existing || c.blockNumber > existing.blockNumber) byAddr.set(key, c);
      }
      const unique = [...byAddr.values()].sort((a, b) => b.blockNumber - a.blockNumber);

      // Fetch block timestamps
      const uniqueBlocks = [...new Set(unique.map((c) => c.blockNumber))];
      const tsMap = new Map<number, number>();
      await Promise.all(
        uniqueBlocks.map(async (bn) => {
          try {
            const block = await rpc.getBlock(bn);
            if (block) tsMap.set(bn, block.timestamp);
          } catch { /* skip */ }
        }),
      );
      for (const c of unique) c.timestamp = tsMap.get(c.blockNumber) ?? 0;

      if (version !== claimersVersion.current) return;
      setClaimers(unique);
      setClaimersLoading(false);

      // Enrich with profiles (fire-and-forget)
      const profiles = await Promise.all(
        unique.map(async (c) => {
          try { return await fetchProfile(c.address); }
          catch { return null; }
        }),
      );
      if (version !== claimersVersion.current) return;
      setClaimers(unique.map((c, i) => ({ ...c, profile: profiles[i] })));
    } catch {
      if (version === claimersVersion.current) setClaimersLoading(false);
    }
  }, [contractAddress, networkConfig]);

  useEffect(() => { loadClaimers(); }, [loadClaimers]);

  async function connect() {
    setStatus({ message: "Connecting...", type: "loading" });
    const addr = await walletConnect();
    if (!addr) {
      setStatus({ message: "Install the UP Browser Extension", type: "error" });
      return;
    }
    setStatus(null);
    await loadState(addr);
  }

  async function claim() {
    const p = getProvider();
    if (!p || !address) return;
    if (codewordRequired && !codewordInput.trim()) {
      setStatus({ message: "Enter the codeword to claim", type: "error" });
      return;
    }
    try {
      setClaiming(true);
      setStatus({ message: "Confirm in your wallet...", type: "loading" });
      const provider = new BrowserProvider(p);
      const signer = await provider.getSigner();
      const c = new Contract(contractAddress, CLAIM_ABI, signer);
      // Use claimWithCode when codeword is required (or always — backward compat)
      const tx = codewordRequired
        ? await c.claimWithCode(codewordInput.trim())
        : await c.claim();
      setStatus({ message: "Waiting for confirmation...", type: "loading" });
      await tx.wait();
      setStatus({ message: isNftStyle ? "NFT claimed successfully!" : "Tokens claimed successfully!", type: "success" });
      setAlreadyClaimed(true);
      await loadState(address);
      loadClaimers();
    } catch (e: any) {
      const msg = e.data || e.reason || e.message?.slice(0, 200) || "Failed";
      const errorMap: Record<string, string> = {
        "0x4aa20f9c": "Incorrect codeword",
        "0x646cf558": "You have already claimed this drop",
        "0x24fbaa90": "Claiming is not active right now",
        "0xcd3b2d03": "Outside the claim window",
        "0xd05cb609": "Max supply has been reached",
        "0xe4455cae": "You don't hold the required tokens",
        "0x94303d52": "You don't have enough followers",
      };
      const selector = typeof msg === "string" ? msg.slice(0, 10) : "";
      const friendly = errorMap[selector]
        || (typeof msg === "string" && msg.includes("WrongCodeword") ? "Incorrect codeword" : null)
        || (typeof msg === "string" ? msg.slice(0, 100) : "Transaction failed");
      setStatus({ message: friendly, type: "error" });
    } finally {
      setClaiming(false);
    }
  }

  async function shareLink() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Claim ${dropName}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function formatTime(ts: number): string {
    if (ts === 0) return "Not set";
    return new Date(ts * 1000).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const codewordOk = !codewordRequired || codewordInput.trim().length > 0;
  const canClaim = isActive && !alreadyClaimed && !claiming && codewordOk && (!eligibility || (eligibility.tokenOk && eligibility.followersOk));
  const explorerUrl = `${networkConfig.explorerBase}/address/${contractAddress}`;
  const hasTimeWindow = startTime > 0 || endTime > 0;

  // Determine claim status label
  let statusLabel = "";
  let statusColor = "";
  if (!claimEnabled) {
    statusLabel = "Paused";
    statusColor = "text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 border-yellow-300 dark:border-yellow-500/20";
  } else if (isActive) {
    statusLabel = "Live";
    statusColor = "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border-green-300 dark:border-green-500/20";
  } else {
    statusLabel = "Scheduled";
    statusColor = "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/20";
  }

  if (pageLoading) {
    return (
      <div className={inIframe ? "min-h-dvh flex items-center justify-center px-4 py-3" : "min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4"}>
        <div className={inIframe ? "w-full" : "max-w-2xl w-full"}>
          <div className={`bg-card rounded-xl border border-border-muted card-elevated animate-pulse ${inIframe ? "p-4" : "p-5 sm:p-8"}`}>
            <div className={`rounded-xl mx-auto bg-surface ${inIframe ? "w-14 h-14 mb-2" : "w-32 h-32 sm:w-48 sm:h-48 mb-4 sm:mb-6"}`} />
            <div className="h-6 bg-surface rounded w-1/2 mx-auto mb-3" />
            <div className="h-4 bg-surface-subtle rounded w-1/3 mx-auto mb-6" />
            <div className="flex justify-center gap-8 mb-6">
              <div className="h-12 bg-surface-muted rounded w-20" />
              <div className="h-12 bg-surface-muted rounded w-20" />
            </div>
            <div className="h-12 bg-surface rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={inIframe ? "min-h-dvh flex items-center justify-center px-4 py-3" : "min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4"}>
      <div className={inIframe ? "w-full relative" : "max-w-2xl w-full"}>
        {inIframe && (
          <a
            href="https://github.com/JordyDutch/issue-tracker/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-3 text-[9px] text-faint hover:text-label transition-colors z-10"
          >
            <span className="text-purple-500 font-bold">BETA</span> · Report issues
          </a>
        )}
        <div className={`bg-card rounded-xl text-center border border-border-muted card-elevated ${inIframe ? "p-6" : "p-5 sm:p-8"}`}>
          {/* Drop header — horizontal in iframe, stacked standalone */}
          {inIframe ? (
            <div className="flex items-center gap-4 mb-5">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-purple-400 flex items-center justify-center text-3xl overflow-hidden flex-shrink-0">
                {dropIcon
                  ? <img src={dropIcon} alt={dropName} className="w-full h-full object-cover" />
                  : (isNftStyle ? "🖼" : "🪙")}
              </div>
              <div className="text-left min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-xl font-bold truncate">{dropName}</h1>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${statusColor}`}>
                    {statusLabel}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-label flex-shrink-0">
                    {isNftStyle ? "NFT" : "Token"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-label flex-wrap">
                  {creatorProfile && (
                    <span className="flex items-center gap-1">
                      by
                      {creatorProfile.image && <img src={creatorProfile.image} alt="" className="w-4 h-4 rounded-full object-cover" />}
                      <span className="text-muted">{creatorProfile.name || (owner ? `${owner.slice(0, 6)}…${owner.slice(-4)}` : "")}</span>
                    </span>
                  )}
                  {amountDisplay && (
                    <span className="text-purple-600 dark:text-purple-400 font-medium">{amountDisplay}/claim</span>
                  )}
                  <span className="text-purple-600 dark:text-purple-400 font-semibold">{claimedDisplay}</span>
                  <span className="text-faint">/ {supplyDisplay}</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-xl mx-auto mb-4 sm:mb-6 bg-gradient-to-br from-violet-600 to-purple-400 flex items-center justify-center text-4xl sm:text-6xl overflow-hidden">
                {dropIcon
                  ? <img src={dropIcon} alt={dropName} className="w-full h-full object-cover" />
                  : (isNftStyle ? "🖼" : "🪙")}
              </div>

              {/* Status badge */}
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColor}`}>
                  {statusLabel}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-label">
                  {isNftStyle ? "NFT" : "Token"}
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-bold mb-0.5">{dropName}</h1>
              {dropSymbol && <p className="text-faint text-xs mb-1">${dropSymbol}</p>}

              {/* Creator */}
              {creatorProfile && (
                <div className="flex items-center justify-center gap-1.5 mb-3">
                  <span className="text-label text-xs">by</span>
                  {creatorProfile.image && (
                    <img src={creatorProfile.image} alt="" className="w-4 h-4 rounded-full object-cover" />
                  )}
                  <span className="text-muted text-xs">
                    {creatorProfile.name || (owner ? `${owner.slice(0, 6)}...${owner.slice(-4)}` : "")}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Connected user */}
          {address && (
            <div className={`flex items-center justify-center gap-2 ${inIframe ? "mb-4" : "mb-3"}`}>
              {profile?.image && (
                <img src={profile.image} alt="" className="w-5 h-5 rounded-full object-cover" />
              )}
              <span className="text-tertiary text-xs font-medium">
                {profile?.name || `${address.slice(0, 6)}...${address.slice(-4)}`}
              </span>
              <button
                onClick={() => {
                  disconnect();
                  setAlreadyClaimed(false); setEligibility(null); setTokenMet([]);
                }}
                className="text-faint hover:text-muted text-[10px] ml-1 cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          )}

          {!address && !alreadyClaimed && (
            <p className={`text-label text-xs ${inIframe ? "mb-4" : "mb-3 sm:text-sm"}`}>
              Connect your Universal Profile to claim
            </p>
          )}

          {/* Amount per claim — hidden in iframe (shown inline in header) */}
          {!inIframe && amountDisplay && (
            <div className="inline-block bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-700 dark:text-purple-400 px-3 py-1 rounded-full text-xs font-medium mb-4">
              {amountDisplay} per claim
            </div>
          )}

          {/* Claim window */}
          {hasTimeWindow && (
            <div className={`bg-surface-muted rounded-xl text-xs ${inIframe ? "p-3 mb-4" : "p-3 mb-4"}`}>
              <div className={`text-label text-[10px] uppercase tracking-wider font-medium ${inIframe ? "mb-1" : "mb-1.5"}`}>
                Claim Window
              </div>
              <div className="flex items-center justify-center gap-3 text-tertiary">
                <span>{formatTime(startTime)}</span>
                <span className="text-faint">→</span>
                <span>{formatTime(endTime)}</span>
              </div>
            </div>
          )}

          {/* Requirements */}
          {reqInfo && (
            <div className={`bg-surface-subtle rounded-xl text-left text-xs ${inIframe ? "p-3 mb-4" : "p-3 sm:p-4 mb-4 sm:text-sm"}`}>
              <div className={`text-muted text-[10px] uppercase tracking-wider text-center font-medium ${inIframe ? "mb-1" : "mb-2"}`}>
                Requirements
              </div>
              {reqInfo.tokens.map((t, i) => (
                <div key={i} className={`flex items-center justify-between gap-2 ${inIframe ? "py-1" : "py-1.5"}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {t.icon ? (
                      <img src={t.icon} alt="" className="w-5 h-5 rounded-md object-cover flex-shrink-0" />
                    ) : (
                      <span className="text-base flex-shrink-0">🪙</span>
                    )}
                    <span className="text-tertiary text-xs truncate">
                      Hold{" "}
                      {t.amount > BigInt(0) ? t.amount.toString() : "any"}{" "}
                      <span className="font-semibold">{t.name}</span>
                      {t.symbol && t.symbol !== t.name && (
                        <span className="text-label ml-1">({t.symbol})</span>
                      )}
                    </span>
                  </div>
                  {tokenMet.length > 0 && (
                    <span className={tokenMet[i] ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                      {tokenMet[i] ? "✓" : "✗"}
                    </span>
                  )}
                </div>
              ))}
              {reqInfo.followers > BigInt(0) && (
                <div className={`flex items-center justify-between ${inIframe ? "py-1" : "py-1.5"}`}>
                  <span className="text-tertiary text-xs">
                    {reqInfo.followers.toString()}+ followers
                  </span>
                  {eligibility && (
                    <span className={eligibility.followersOk ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                      {eligibility.followersOk ? "✓" : "✗"}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Inactive warning */}
          {!isActive && tokenType && (
            <div className={`bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 rounded-xl text-xs ${inIframe ? "px-3 py-2 mb-4" : "px-3 py-2.5 mb-4 sm:text-sm"}`}>
              {!claimEnabled
                ? "This drop is currently paused by the creator"
                : "Claim window has not started yet"}
            </div>
          )}

          {/* Stats — hidden in iframe (shown inline in header) */}
          {!inIframe && (
            <div className="flex justify-center gap-8 sm:gap-12 mb-6 sm:mb-8">
              <div>
                <div className="text-[10px] sm:text-xs text-label uppercase tracking-wider">
                  Claimers
                </div>
                <div className="text-lg sm:text-xl font-semibold text-purple-600 dark:text-purple-400">
                  {claimedDisplay}
                </div>
              </div>
              <div>
                <div className="text-[10px] sm:text-xs text-label uppercase tracking-wider">
                  Max Supply
                </div>
                <div className="text-lg sm:text-xl font-semibold text-purple-600 dark:text-purple-400">
                  {supplyDisplay}
                </div>
              </div>
            </div>
          )}

          {/* Action button */}
          {!address ? (
            <button
              onClick={connect}
              className={`w-full rounded-xl font-semibold border-2 border-purple-400 text-purple-400 hover:bg-purple-400/10 transition-all cursor-pointer active:scale-[0.97] ${inIframe ? "py-3 text-sm" : "py-3.5 sm:py-4 text-base sm:text-lg"}`}
            >
              Connect Universal Profile
            </button>
          ) : alreadyClaimed ? (
            <button
              disabled
              className={`w-full rounded-xl font-semibold bg-green-50 dark:bg-green-500/20 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-500/30 cursor-not-allowed ${inIframe ? "py-3 text-sm" : "py-3.5 sm:py-4 text-base sm:text-lg"}`}
            >
              Already Claimed ✓
            </button>
          ) : (
            <>
              {codewordRequired && (
                <div className={inIframe ? "mb-4" : "mb-3"}>
                  <label className={`text-[10px] text-label uppercase tracking-wider block text-center ${inIframe ? "mb-1" : "mb-1.5"}`}>
                    🔑 Codeword required
                  </label>
                  <input
                    type="text"
                    value={codewordInput}
                    onChange={(e) => setCodewordInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && canClaim && claim()}
                    placeholder="Enter codeword..."
                    className={`w-full bg-surface border border-border-default rounded-xl text-sm text-secondary focus:outline-none focus:border-purple-400 transition-colors text-center tracking-widest placeholder:tracking-normal ${inIframe ? "px-4 py-2.5" : "px-4 py-3"}`}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              )}
            <button
              onClick={claim}
              disabled={!canClaim}
              className={`w-full rounded-xl font-semibold bg-purple-400 text-white hover:bg-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.97] ${inIframe ? "py-3 text-sm" : "py-3.5 sm:py-4 text-base sm:text-lg"}`}
            >
              {claiming
                ? "Claiming..."
                : !eligibility || (eligibility.tokenOk && eligibility.followersOk)
                ? isNftStyle ? "Claim NFT" : "Claim Tokens"
                : "Requirements not met"}
            </button>
            </>
          )}

          {/* Status message */}
          {status && (
            <div
              className={`mt-2 px-3 py-2 rounded-xl text-xs ${
                status.type === "success"
                  ? "bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400"
                  : status.type === "error"
                  ? "bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400"
                  : "bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-700 dark:text-purple-400"
              }`}
            >
              {status.message}
            </div>
          )}

          {/* Share buttons — visible after claiming */}
          {alreadyClaimed && (() => {
            const claimUrl = `https://agent-token-claimer.vercel.app/claim/${contractAddress}`;
            const shareText = `I just claimed ${dropName} on LUKSO!\n\nA project by @JordyDutch & @LUKSOAgent`;
            const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(claimUrl)}`;
            const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(claimUrl)}&text=${encodeURIComponent(shareText)}`;
            return (
              <div className="mt-4">
                <p className="text-[10px] text-label uppercase tracking-wider text-center mb-2">Share your claim</p>
                <div className="flex items-center justify-center gap-2">
                  <a
                    href={tweetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border-default text-muted hover:text-primary hover:border-purple-500/30 transition-all"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    Post
                  </a>
                  <a
                    href={telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border-default text-muted hover:text-primary hover:border-purple-500/30 transition-all"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                    Share
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(claimUrl).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border-default text-muted hover:text-primary hover:border-purple-500/30 transition-all cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    {copied ? "Copied!" : "Copy link"}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Recent claimers */}
          {!inIframe && claimers.length > 0 && (
            <div className="mt-6 pt-5 border-t border-border-muted">
              <div className="text-[10px] text-label uppercase tracking-wider text-center font-medium mb-3">
                Recent Claimers
              </div>
              <div className="space-y-2">
                {(showAllClaimers ? claimers : claimers.slice(0, 10)).map((c) => (
                  <div key={c.address} className="flex items-center gap-2.5 px-2 py-1.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-400 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {c.profile?.image ? (
                        <img src={c.profile.image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white font-medium text-[8px]">
                          {c.address.slice(2, 4).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-secondary truncate flex-1 text-left">
                      {c.profile?.name || `${c.address.slice(0, 6)}...${c.address.slice(-4)}`}
                    </span>
                    <span className="text-[10px] text-faint flex-shrink-0">
                      {timeSince(c.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
              {claimers.length > 10 && (
                <button
                  onClick={() => setShowAllClaimers(!showAllClaimers)}
                  className="text-[10px] text-purple-500 hover:text-purple-400 text-center mt-2 w-full cursor-pointer transition-colors"
                >
                  {showAllClaimers ? "Show less" : `Show all ${claimers.length} claimers`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bottom bar — hidden in iframe */}
        {!inIframe && (
          <div className="flex items-center justify-between mt-4 sm:mt-6 px-2 gap-2">
            <Link
              href="/"
              className="text-faint text-[10px] sm:text-xs hover:text-purple-400 transition-colors"
            >
              ← All drops
            </Link>

            <div className="flex items-center gap-3">
              <button
                onClick={shareLink}
                className="text-faint text-[10px] sm:text-xs hover:text-purple-400 transition-colors cursor-pointer"
              >
                {copied ? "Link copied!" : "Share"}
              </button>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-faint text-[10px] sm:text-xs hover:text-purple-400 transition-colors"
              >
                Explorer
              </a>
              <CopyButton
                text={contractAddress}
                label="Copy address"
                className="text-[10px] sm:text-xs"
              />
              {address && owner && address.toLowerCase() === owner.toLowerCase() && (
                <Link
                  href={`/manage/${contractAddress}`}
                  className="text-faint text-[10px] sm:text-xs hover:text-purple-400 transition-colors"
                >
                  Manage →
                </Link>
              )}
            </div>
          </div>
        )}

        {!inIframe && <Footer />}
      </div>
    </div>
  );
}
