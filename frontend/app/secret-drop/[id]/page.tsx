"use client";

import { useState, useEffect, use } from "react";
import { BrowserProvider } from "ethers";
import Link from "next/link";
import Footer from "../../components/Footer";
import { useWallet } from "../../components/WalletProvider";
import { useNetwork } from "../../components/NetworkProvider";
import { useUPProvider } from "../../components/UPProviderInit";
import { getProvider } from "../../lib/contracts";
import { PublicDropInfo, TokenReq } from "../../lib/secret-drop";
import { IPFS_GATEWAY, fetchAssetByAddress } from "../../lib/envio";

const ZERO = "0x0000000000000000000000000000000000000000";

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
  const { address, connect: walletConnect } = useWallet();
  const { networkId } = useNetwork();
  const { inIframe } = useUPProvider();

  const [drop, setDrop] = useState<PublicDropInfo | null>(null);
  const [tokenInfos, setTokenInfos] = useState<TokenInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState<string | null>(null);
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
        if (data) setDrop(data);
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

  if (loading) {
    return (
      <div className={inIframe ? "flex items-center justify-center py-12" : "min-h-screen bg-bg flex items-center justify-center"}>
        <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !drop) {
    return (
      <div className={inIframe ? "flex flex-col items-center justify-center gap-4 py-12" : "min-h-screen bg-bg flex flex-col items-center justify-center gap-4"}>
        <p className="text-muted">Drop not found</p>
        <Link href="/" className="text-purple-400 text-sm hover:underline">Back home</Link>
      </div>
    );
  }

  const hasReqs = drop.tokenRequirements.length > 0 || drop.minFollowers > 0 || drop.followerRequirement;
  const poolEmpty = drop.mode === "pool" && drop.remaining !== null && drop.remaining === 0;
  const isActive = drop.active && !poolEmpty;

  return (
    <div className={inIframe ? "text-primary" : "min-h-screen bg-bg text-primary"}>
      <div className={inIframe ? "w-full px-4 py-4 relative" : "max-w-2xl mx-auto px-4 py-12 pb-32"}>
        {inIframe && (
          <a
            href="https://github.com/JordyDutch/issue-tracker/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-4 text-[9px] text-faint hover:text-label transition-colors z-10"
          >
            <span className="text-purple-500 font-bold">BETA</span> · Report issues
          </a>
        )}

        {/* Badge */}
        <div className="flex items-center gap-2 mb-6">
          <span className="bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold px-2.5 py-1 rounded-full">
            Secret Drop
          </span>
          {!isActive && (
            <span className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs px-2.5 py-1 rounded-full">
              {poolEmpty ? "All claimed" : "Inactive"}
            </span>
          )}
        </div>

        {/* Title & description */}
        <h1 className="text-2xl font-bold text-primary mb-3">{drop.title}</h1>
        {drop.description && (
          <p className="text-muted text-sm leading-relaxed mb-6">{drop.description}</p>
        )}

        {/* Remaining (pool mode) */}
        {drop.mode === "pool" && drop.remaining !== null && (
          <div className="text-xs text-label mb-6">
            {drop.remaining} of {drop.totalCodes} remaining
          </div>
        )}

        {/* Requirements */}
        {hasReqs && (
          <div className="bg-surface-subtle border border-border-muted rounded-xl p-4 mb-6">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Requirements</p>
            <div className="flex flex-col gap-2">
              {tokenInfos.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  {t.icon ? (
                    <img src={t.icon} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-surface-hover flex items-center justify-center text-[10px] text-muted">
                      {t.symbol.slice(0, 2)}
                    </div>
                  )}
                  <span className="text-sm text-tertiary">
                    {t.minBalance === "0"
                      ? `Hold any ${t.name}`
                      : `Hold ${Number(BigInt(t.minBalance)) / 1e18} ${t.symbol}`}
                  </span>
                </div>
              ))}
              {drop.minFollowers > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-purple-500/10 flex items-center justify-center text-[10px] text-purple-400">
                    👥
                  </div>
                  <span className="text-sm text-tertiary">At least {drop.minFollowers} followers</span>
                </div>
              )}
              {drop.followerRequirement && (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-purple-500/10 flex items-center justify-center text-[10px] text-purple-400">
                    ✓
                  </div>
                  <span className="text-sm text-tertiary">
                    Follow{" "}
                    <span className="font-mono text-xs text-purple-400">
                      {drop.followerRequirement.followAddress.slice(0, 8)}…
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Claim result */}
        {claimed ? (
          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-5">
            <p className="text-green-700 dark:text-green-400 text-xs font-semibold uppercase tracking-wide mb-2">
              Your secret
            </p>
            <div className="bg-bg border border-border-default rounded-lg px-4 py-3 flex items-center justify-between gap-3 mb-3">
              <span className="font-mono text-sm text-primary break-all">{claimed}</span>
              <button
                onClick={copyCode}
                className="shrink-0 text-xs text-muted hover:text-primary border border-border-default rounded-md px-2 py-1 transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-label text-xs">
              Save this — it won&apos;t be shown again if you navigate away.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {error && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-4 py-3 text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {!address ? (
              <button
                onClick={() => walletConnect()}
                className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all text-sm"
              >
                Connect Universal Profile
              </button>
            ) : !isActive ? (
              <div className="text-center text-label text-sm py-4">
                {poolEmpty ? "All codes have been claimed." : "This drop is not active."}
              </div>
            ) : (
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-all text-sm flex items-center justify-center gap-2"
              >
                {claiming ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sign in wallet…
                  </>
                ) : (
                  "Claim Secret"
                )}
              </button>
            )}

            {address && (
              <p className="text-center text-faint text-xs">
                Connected as {address.slice(0, 6)}…{address.slice(-4)}
              </p>
            )}
          </div>
        )}

      </div>
      {!inIframe && <Footer />}
    </div>
  );
}
