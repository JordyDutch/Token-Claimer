"use client";

import { useState, useEffect, use } from "react";
import { BrowserProvider } from "ethers";
import Link from "next/link";
import CopyButton from "../../components/CopyButton";
import Footer from "../../components/Footer";
import { useWallet } from "../../components/WalletProvider";
import { useNetwork } from "../../components/NetworkProvider";
import { useUPProvider } from "../../components/UPProviderInit";
import { getProvider } from "../../lib/contracts";
import { PublicDropInfo, TokenReq } from "../../lib/secret-drop";
import { fetchAssetByAddress } from "../../lib/envio";
import { fetchProfile, ProfileInfo } from "../../lib/profile";

const IPFS_GW = "https://api.universalprofile.cloud/ipfs";

interface TokenInfo {
  address: string;
  minBalance: string;
  name: string;
  symbol: string;
  icon: string | null;
}

function buildClaimMessage(dropId: string, address: string): string {
  const ts = Math.floor(Date.now() / 1000);
  return `Claim drop ${dropId} as ${address} at ${ts}`;
}

export default function SecretDropPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { address, profile, connect: walletConnect, disconnect } = useWallet();
  const { networkId } = useNetwork();
  const { inIframe } = useUPProvider();

  const [drop, setDrop] = useState<PublicDropInfo | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<ProfileInfo | null>(null);
  const [tokenInfos, setTokenInfos] = useState<TokenInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState<string | null>(null);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load drop info
  useEffect(() => {
    setLoading(true);
    fetch(`/api/secret-drop/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) {
          setDrop(data);
          // Fetch creator profile
          if (data.creator) {
            fetchProfile(data.creator).then(setCreatorProfile).catch(() => {});
          }
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  // Load token metadata from Envio
  useEffect(() => {
    if (!drop?.tokenRequirements?.length) { setTokenInfos([]); return; }
    Promise.all(
      drop.tokenRequirements.map(async (req: TokenReq) => {
        const asset = await fetchAssetByAddress(req.address).catch(() => null);
        return {
          address: req.address,
          minBalance: req.minBalance,
          name: asset?.lsp4TokenName ?? req.address.slice(0, 10) + "…",
          symbol: asset?.lsp4TokenSymbol ?? "?",
          icon: asset?.icon ?? null,
        };
      })
    ).then(setTokenInfos);
  }, [drop]);

  async function handleClaim() {
    setError(null);
    const p = getProvider();
    if (!p) { setError("Universal Profile extension not found"); return; }
    if (!address) {
      await walletConnect();
      return;
    }

    try {
      setClaiming(true);
      const provider = new BrowserProvider(p);
      const signer = await provider.getSigner();
      const message = buildClaimMessage(id, address);
      const signature = await signer.signMessage(message);

      const res = await fetch(`/api/secret-drop/${id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Claim failed");
        return;
      }
      setClaimed(data.code);
      if (data.alreadyClaimed) setAlreadyClaimed(true);
    } catch (e: any) {
      if (e?.code === 4001 || e?.code === "ACTION_REJECTED") {
        setError("Signature rejected");
      } else {
        setError(e?.message ?? "Something went wrong");
      }
    } finally {
      setClaiming(false);
    }
  }

  function copyCode() {
    if (!claimed) return;
    navigator.clipboard.writeText(claimed).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const dropImage = (drop as any)?.image;
  const hasReqs = drop ? (drop.tokenRequirements.length > 0 || drop.minFollowers > 0 || drop.followerRequirement) : false;
  const poolEmpty = drop ? (drop.mode === "pool" && drop.remaining !== null && drop.remaining === 0) : false;
  const isActive = drop ? (drop.active && !poolEmpty) : false;

  // Status label
  let statusLabel = "";
  let statusColor = "";
  if (drop) {
    if (!drop.active) {
      statusLabel = "Paused";
      statusColor = "text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 border-yellow-300 dark:border-yellow-500/20";
    } else if (poolEmpty) {
      statusLabel = "All claimed";
      statusColor = "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/20";
    } else {
      statusLabel = "Live";
      statusColor = "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border-green-300 dark:border-green-500/20";
    }
  }

  if (loading) {
    return (
      <div className={inIframe ? "min-h-dvh flex items-center justify-center px-4 py-3" : "min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4"}>
        <div className={inIframe ? "w-full" : "max-w-2xl w-full"}>
          <div className={`bg-card rounded-xl border border-border-muted card-elevated animate-pulse ${inIframe ? "p-4" : "p-5 sm:p-8"}`}>
            <div className={`rounded-xl mx-auto bg-surface ${inIframe ? "w-14 h-14 mb-2" : "w-32 h-32 sm:w-48 sm:h-48 mb-4 sm:mb-6"}`} />
            <div className="h-6 bg-surface rounded w-1/2 mx-auto mb-3" />
            <div className="h-4 bg-surface-subtle rounded w-1/3 mx-auto mb-6" />
            <div className="h-12 bg-surface rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !drop) {
    return (
      <div className={inIframe ? "min-h-dvh flex flex-col items-center justify-center gap-4 px-4 py-3" : "min-h-dvh flex flex-col items-center justify-center gap-4 px-3 py-6 sm:p-4"}>
        <p className="text-muted">Drop not found</p>
        <Link href="/" className="text-pink-500 text-sm hover:underline">Back home</Link>
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
            <span className="text-pink-500 font-bold">BETA</span> · Report issues
          </a>
        )}
        <div className={`bg-card rounded-xl text-center border border-border-muted card-elevated ${inIframe ? "p-6" : "p-5 sm:p-8"}`}>
          {/* Drop header — horizontal in iframe, stacked standalone */}
          {inIframe ? (
            <div className="flex items-center gap-4 mb-5">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-3xl overflow-hidden flex-shrink-0">
                {dropImage
                  ? <img src={`${IPFS_GW}/${dropImage}`} alt={drop.title} className="w-full h-full object-cover" />
                  : "🔒"}
              </div>
              <div className="text-left min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-xl font-bold truncate">{drop.title}</h1>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${statusColor}`}>
                    {statusLabel}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30 flex-shrink-0">
                    Secret
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-label flex-wrap">
                  {creatorProfile && (
                    <span className="flex items-center gap-1">
                      by
                      {creatorProfile.image && <img src={creatorProfile.image} alt="" className="w-4 h-4 rounded-full object-cover" />}
                      <span className="text-muted">{creatorProfile.name || `${drop.creator.slice(0, 6)}…${drop.creator.slice(-4)}`}</span>
                    </span>
                  )}
                  {drop.mode === "pool" && drop.remaining !== null && (
                    <>
                      <span className="text-pink-500 dark:text-pink-500 font-semibold">{drop.remaining}</span>
                      <span className="text-faint">/ {drop.totalCodes} remaining</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Large icon */}
              <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-xl mx-auto mb-4 sm:mb-6 bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-4xl sm:text-6xl overflow-hidden">
                {dropImage
                  ? <img src={`${IPFS_GW}/${dropImage}`} alt={drop.title} className="w-full h-full object-cover" />
                  : "🔒"}
              </div>

              {/* Status badge */}
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColor}`}>
                  {statusLabel}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30">
                  Secret
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-bold mb-0.5">{drop.title}</h1>

              {/* Creator */}
              {creatorProfile && (
                <div className="flex items-center justify-center gap-1.5 mb-3">
                  <span className="text-label text-xs">by</span>
                  {creatorProfile.image && (
                    <img src={creatorProfile.image} alt="" className="w-4 h-4 rounded-full object-cover" />
                  )}
                  <span className="text-muted text-xs">
                    {creatorProfile.name || `${drop.creator.slice(0, 6)}...${drop.creator.slice(-4)}`}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Description */}
          {drop.description && (
            <p className={`text-muted text-xs leading-relaxed ${inIframe ? "mb-4 text-left" : "mb-4 sm:text-sm"}`}>{drop.description}</p>
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
                onClick={() => { disconnect(); setClaimed(null); setAlreadyClaimed(false); }}
                className="text-faint hover:text-muted text-[10px] ml-1 cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          )}

          {!address && !claimed && (
            <p className={`text-label text-xs ${inIframe ? "mb-4" : "mb-3 sm:text-sm"}`}>
              Connect your Universal Profile to claim
            </p>
          )}

          {/* Remaining — hidden in iframe (shown inline in header) */}
          {!inIframe && drop.mode === "pool" && drop.remaining !== null && (
            <div className="flex justify-center gap-8 sm:gap-12 mb-6 sm:mb-8">
              <div>
                <div className="text-[10px] sm:text-xs text-label uppercase tracking-wider">
                  Remaining
                </div>
                <div className="text-lg sm:text-xl font-semibold text-pink-500 dark:text-pink-500">
                  {drop.remaining}
                </div>
              </div>
              <div>
                <div className="text-[10px] sm:text-xs text-label uppercase tracking-wider">
                  Total
                </div>
                <div className="text-lg sm:text-xl font-semibold text-pink-500 dark:text-pink-500">
                  {drop.totalCodes}
                </div>
              </div>
            </div>
          )}

          {/* Requirements */}
          {hasReqs && (
            <div className={`bg-surface-subtle rounded-xl text-left text-xs ${inIframe ? "p-3 mb-4" : "p-3 sm:p-4 mb-4 sm:text-sm"}`}>
              <div className={`text-muted text-[10px] uppercase tracking-wider text-center font-medium ${inIframe ? "mb-1" : "mb-2"}`}>
                Requirements
              </div>
              {tokenInfos.map((t, i) => (
                <div key={i} className={`flex items-center gap-2 ${inIframe ? "py-1" : "py-1.5"}`}>
                  {t.icon ? (
                    <img src={t.icon} alt="" className="w-5 h-5 rounded-md object-cover flex-shrink-0" />
                  ) : (
                    <span className="text-base flex-shrink-0">🪙</span>
                  )}
                  <span className="text-tertiary text-xs truncate">
                    Hold{" "}
                    {t.minBalance === "0" ? "any" : `${Number(BigInt(t.minBalance)) / 1e18}`}{" "}
                    <span className="font-semibold">{t.name}</span>
                    {t.symbol && t.symbol !== t.name && (
                      <span className="text-label ml-1">({t.symbol})</span>
                    )}
                  </span>
                </div>
              ))}
              {drop.minFollowers > 0 && (
                <div className={`flex items-center gap-2 ${inIframe ? "py-1" : "py-1.5"}`}>
                  <span className="text-tertiary text-xs">
                    {drop.minFollowers}+ followers
                  </span>
                </div>
              )}
              {drop.followerRequirement && (
                <div className={`flex items-center gap-2 ${inIframe ? "py-1" : "py-1.5"}`}>
                  <span className="text-tertiary text-xs">
                    Follow{" "}
                    <span className="font-mono text-xs text-pink-500">
                      {drop.followerRequirement.followAddress.slice(0, 8)}…
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Inactive warning */}
          {!isActive && (
            <div className={`bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 rounded-xl text-xs ${inIframe ? "px-3 py-2 mb-4" : "px-3 py-2.5 mb-4 sm:text-sm"}`}>
              {poolEmpty ? "All codes have been claimed" : "This drop is currently paused"}
            </div>
          )}

          {/* Claim result */}
          {claimed ? (
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-5 text-left">
              <p className="text-green-700 dark:text-green-400 text-xs font-semibold uppercase tracking-wide mb-2">
                {alreadyClaimed ? "Already claimed \u2014 here\u2019s your code again" : "Your secret"}
              </p>
              <div className="bg-bg border border-border-default rounded-lg px-4 py-3 flex items-center justify-between gap-3 mb-3">
                <span className="font-mono text-sm text-primary break-all">{claimed}</span>
                <button
                  onClick={copyCode}
                  className="shrink-0 text-xs text-muted hover:text-primary border border-border-default rounded-md px-2 py-1 transition-colors cursor-pointer"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-label text-xs">
                {alreadyClaimed
                  ? "Each wallet can only claim once. This is the code you received earlier."
                  : "Save this \u2014 it won\u2019t be shown again if you navigate away."}
              </p>
            </div>
          ) : (
            <>
              {/* Error */}
              {error && (
                <div className={`bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-xs ${inIframe ? "px-3 py-2 mb-3" : "px-3 py-2.5 mb-3 sm:text-sm"}`}>
                  {error}
                </div>
              )}

              {/* Action button */}
              {!address ? (
                <button
                  onClick={() => walletConnect()}
                  className={`w-full rounded-xl font-semibold border-2 border-pink-500 text-pink-500 hover:bg-pink-500/10 transition-all cursor-pointer active:scale-[0.97] ${inIframe ? "py-3 text-sm" : "py-3.5 sm:py-4 text-base sm:text-lg"}`}
                >
                  Connect Universal Profile
                </button>
              ) : !isActive ? null : (
                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className={`w-full rounded-xl font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.97] ${inIframe ? "py-3 text-sm" : "py-3.5 sm:py-4 text-base sm:text-lg"}`}
                >
                  {claiming ? "Sign in wallet…" : "Claim Secret"}
                </button>
              )}
            </>
          )}
        </div>

        {/* Bottom bar */}
        {!inIframe && (
          <div className="flex items-center justify-between mt-4 sm:mt-6 px-2 gap-2">
            <Link
              href="/"
              className="text-faint text-[10px] sm:text-xs hover:text-pink-500 transition-colors"
            >
              ← All drops
            </Link>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const url = window.location.href;
                  navigator.clipboard.writeText(url).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
                className="text-faint text-[10px] sm:text-xs hover:text-pink-500 transition-colors cursor-pointer"
              >
                {copied && !claimed ? "Link copied!" : "Share"}
              </button>
            </div>
          </div>
        )}

        {!inIframe && <Footer />}
      </div>
    </div>
  );
}
