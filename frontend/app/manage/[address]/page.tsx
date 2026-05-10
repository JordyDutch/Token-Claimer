"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits, parseUnits } from "ethers";
import { uploadAndSetLSP4Metadata, setLSP4Creators, addToLSP12IssuedAssets, LSP4_METADATA_KEY, type Lsp4Link, type Lsp4Icon } from "../../lib/lsp4";
import {
  CLAIM_ABI, LSP7_EXTRA_ABI, LSP8_EXTRA_ABI, ZERO,
  LSP4_TOKEN_NAME_KEY,
  getProvider, detectTokenType, friendlyRevert,
} from "../../lib/contracts";
import Link from "next/link";
import CopyButton from "../../components/CopyButton";
import Footer from "../../components/Footer";
import { useWallet } from "../../components/WalletProvider";
import { useNetwork } from "../../components/NetworkProvider";
import { useUPProvider } from "../../components/UPProviderInit";
import TokenSearchInput from "../../components/TokenSearchInput";
import UPSearchInput from "../../components/UPSearchInput";

type Status = { message: string; type: "success" | "error" | "loading"; link?: string } | null;

export default function ManagePage() {
  const params = useParams();
  const contractAddress = params.address as string;
  const { address, profile, connect: walletConnect, disconnect } = useWallet();
  const { config: networkConfig } = useNetwork();
  const { inIframe } = useUPProvider();

  const [isOwner, setIsOwner] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [tokenType, setTokenType] = useState<"LSP7" | "LSP7-NFT" | "LSP8" | null>(null);
  const [isNftStyle, setIsNftStyle] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [dropName, setDropName] = useState("");
  const [claimEnabled, setClaimEnabled] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [amountPerClaim, setAmountPerClaim] = useState("");
  const [totalClaimed, setTotalClaimed] = useState("0");
  const [maxSupply, setMaxSupply] = useState("0");
  const [tokenReqs, setTokenReqs] = useState<{ addr: string; amount: string }[]>([]);
  const [reqFollowers, setReqFollowers] = useState("");
  const [reqFollowAddress, setReqFollowAddress] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [exploreVisible, setExploreVisible] = useState(true);
  const [visibilitySaving, setVisibilitySaving] = useState(false);

  // LSP4 metadata state
  const [metaDescription, setMetaDescription] = useState("");
  const [metaIconFile, setMetaIconFile] = useState<File | null>(null);
  const [metaIconPreview, setMetaIconPreview] = useState<string | null>(null);
  const [existingIcon, setExistingIcon] = useState<Lsp4Icon | null>(null);
  const [metaLinks, setMetaLinks] = useState<Lsp4Link[]>([{ title: "", url: "" }]);
  const [metaAssetFiles, setMetaAssetFiles] = useState<File[]>([]);
  const [metaSaving, setMetaSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [codewordEnabled, setCodewordEnabled] = useState(false);
  const [codewordInput, setCodewordInput] = useState("");
  const metaIconRef = useRef<HTMLInputElement>(null);
  const metaAssetRef = useRef<HTMLInputElement>(null);

  // Auto-dismiss success toasts after 3s, error toasts after 8s
  useEffect(() => {
    if (status?.type === "success") {
      const t = setTimeout(() => setStatus(null), 3000);
      return () => clearTimeout(t);
    }
    if (status?.type === "error") {
      const t = setTimeout(() => setStatus(null), 8000);
      return () => clearTimeout(t);
    }
  }, [status]);

  function handleMetaAssetFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files ?? []);
    if (newFiles.length === 0) return;
    setMetaAssetFiles((prev) => [...prev, ...newFiles]);
    // Reset input after state update to avoid sync interference
    const input = e.target;
    setTimeout(() => { input.value = ""; }, 0);
  }

  function removeMetaAsset(index: number) {
    setMetaAssetFiles((prev) => prev.filter((_, i) => i !== index));
  }

  const loadState = useCallback(async (userAddr: string) => {
    const rpc = new JsonRpcProvider(networkConfig.rpc);
    const abi = [...CLAIM_ABI, ...LSP7_EXTRA_ABI, ...LSP8_EXTRA_ABI];
    const c = new Contract(contractAddress, abi, rpc);
    try {
      const type = await detectTokenType(c);
      setTokenType(type);
      const owner = await c.owner();
      setIsOwner(owner.toLowerCase() === userAddr.toLowerCase());
      const safe = (p: Promise<any>, fallback: any = null) => p.catch(() => fallback);
      const [nameRaw, enabled, start, end, amount, supply, reqResult, rF, codeEnabled, followAddr] = await Promise.all([
        safe(c.getData(LSP4_TOKEN_NAME_KEY), null),
        safe(c.claimEnabled(), false),
        safe(c.startTime(), BigInt(0)),
        safe(c.endTime(), BigInt(0)),
        safe(c.amountPerClaim(), BigInt(0)),
        // v5 proxy tokens use tokenSupplyCap(), v3/v4 use maxSupply()
        c.tokenSupplyCap().catch(() => c.maxSupply()).catch(() => BigInt(0)),
        safe(c.getTokenRequirements(), { tokens: [], minBalances: [] }),
        safe(c.requiredFollowers(), BigInt(0)),
        safe(c.codewordEnabled(), false),
        safe(c.requiredFollowAddress(), null),
      ]);
      setCodewordEnabled(Boolean(codeEnabled));
      setDropName(nameRaw && nameRaw !== "0x" ? Buffer.from(nameRaw.replace(/^0x/, ""), "hex").toString("utf8") : "");
      setClaimEnabled(enabled);
      // Display as human-readable (will be re-scaled on save); decimals loaded below
      // We store formatted value here; tokenDecimals may not be set yet — will be overwritten
      // after decimals() resolves. Use a ref-safe approach: store raw, format after decimals load.
      setAmountPerClaim(amount ? amount.toString() : "0"); // raw, reformatted below once decimals known
      // type(uint256).max from v5 proxy = unlimited; treat as "0" for display
      const isUnlimited = supply === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
      setMaxSupply(isUnlimited ? "0" : (supply ? supply.toString() : "0"));
      // Load multi-token requirements
      const tokensArr: string[] = reqResult?.tokens ?? [];
      const balancesArr: bigint[] = reqResult?.minBalances ?? [];
      setTokenReqs(tokensArr.map((addr: string, i: number) => ({
        addr,
        amount: balancesArr[i]?.toString() ?? "0",
      })));
      setReqFollowers(rF > BigInt(0) ? rF.toString() : "");
      if (followAddr && followAddr !== "0x0000000000000000000000000000000000000000") {
        setReqFollowAddress(followAddr);
      }
      if (start > BigInt(0)) setStartTime(new Date(Number(start) * 1000).toISOString().slice(0, 16));
      if (end > BigInt(0)) setEndTime(new Date(Number(end) * 1000).toISOString().slice(0, 16));
      try {
        if (type === "LSP7" || type === "LSP7-NFT") {
          const cl = await c.totalClaimers();
          setTotalClaimed(cl.toString());
          const dec = await c.decimals();
          const decNum = Number(dec);
          setTokenDecimals(decNum);
          setIsNftStyle(type === "LSP7-NFT" || decNum === 0);
          // Reformat amountPerClaim and maxSupply now that we know decimals
          if (amount && decNum > 0) {
            setAmountPerClaim(formatUnits(amount, decNum));
          }
          if (supply && decNum > 0 && !isUnlimited) {
            setMaxSupply(formatUnits(supply, decNum));
          }
        } else {
          const cl = await c.totalClaimed();
          setTotalClaimed(cl.toString());
          setIsNftStyle(true);
        }
      } catch { setTotalClaimed("?"); }

      // Load existing LSP4 metadata to pre-fill the form
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
          const meta = json?.LSP4Metadata;
          if (!meta) return;
          if (meta.description) setMetaDescription(meta.description);
          const iconObj = meta.images?.[0]?.[0] ?? meta.icon?.[0];
          if (iconObj?.url) {
            if (iconObj.url.startsWith("https://") || iconObj.url.startsWith("http://")) {
              setMetaIconPreview(iconObj.url);
            } else {
              setMetaIconPreview(`https://api.universalprofile.cloud/ipfs/${iconObj.url.replace("ipfs://", "")}`);
            }
            setExistingIcon({ url: iconObj.url, verification: iconObj.verification });
          }
          const links = meta.links;
          if (Array.isArray(links) && links.length > 0) {
            setMetaLinks(links.map((l: any) => ({ title: l.title ?? "", url: l.url ?? "" })));
          }
        } catch { /* no existing metadata */ }
      });
    } catch (e) { console.error(e); }
  }, [contractAddress, networkConfig]);

  // Load visibility state from KV
  useEffect(() => {
    fetch(`/api/drop-visibility?network=${networkConfig.id}`)
      .then((r) => r.json())
      .then((data) => {
        const hidden: string[] = data.hidden ?? [];
        setExploreVisible(!hidden.includes(contractAddress.toLowerCase()));
      })
      .catch(() => {});
  }, [contractAddress, networkConfig.id]);

  // Auto-load when wallet is already connected
  useEffect(() => {
    if (address) loadState(address);
  }, [address, loadState]);

  async function connect() {
    setStatus({ message: "Connecting...", type: "loading" });
    const addr = await walletConnect();
    if (!addr) {
      const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      setStatus(mobile
        ? { message: "Open via the Universal Profiles mobile app", type: "error", link: "https://universalprofile.cloud/" }
        : { message: "Install the UP Browser Extension", type: "error", link: "https://chromewebstore.google.com/detail/universal-profiles/abchhpf8hn4lfpcnhbmgfkbiimhmbpkh" });
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
      setStatus({ message: friendlyRevert(e), type: "error" });
    }
  }

  function copyClaimLink() {
    const url = `${window.location.origin}/claim/${contractAddress}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function toggleExploreVisibility() {
    const p = getProvider();
    if (!p || !address) return;
    try {
      setVisibilitySaving(true);
      const newVisible = !exploreVisible;
      const ts = Math.floor(Date.now() / 1000);
      const message = `Toggle visibility for ${contractAddress} as ${address} at ${ts}`;
      const provider = new BrowserProvider(p);
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(message);
      const res = await fetch("/api/drop-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          signature,
          visible: newVisible,
          network: networkConfig.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update visibility");
      setExploreVisible(newVisible);
      setStatus({ message: newVisible ? "Drop is now visible on Explore" : "Drop hidden from Explore", type: "success" });
    } catch (e: any) {
      setStatus({ message: e.message?.slice(0, 100) || "Failed to toggle visibility", type: "error" });
    } finally {
      setVisibilitySaving(false);
    }
  }

  async function updateMetadata() {
    const p = getProvider();
    if (!p || !address) return;
    try {
      setMetaSaving(true);
      setStatus({ message: "Uploading to IPFS...", type: "loading" });
      const provider = new BrowserProvider(p);
      const signer = await provider.getSigner();
      const validLinks = metaLinks.filter((l) => l.title.trim() && l.url.trim());
      await uploadAndSetLSP4Metadata(
        contractAddress,
        signer,
        {
          name: dropName,
          description: metaDescription.trim(),
          iconFile: metaIconFile,
          existingIcon: metaIconFile ? null : existingIcon,
          links: validLinks,
          assetFiles: metaAssetFiles.length > 0 ? metaAssetFiles : undefined,
        },
        (msg) => setStatus({ message: msg, type: "loading" })
      );
      setStatus({ message: "Metadata updated!", type: "success" });
    } catch (e: any) {
      setStatus({ message: friendlyRevert(e, "Metadata update failed"), type: "error" });
    } finally {
      setMetaSaving(false);
    }
  }

  async function verifyCreator() {
    const p = getProvider();
    if (!p || !address) return;
    try {
      setVerifying(true);
      const provider = new BrowserProvider(p);
      const signer = await provider.getSigner();
      // Step 1: set LSP4Creators[] on the contract
      await setLSP4Creators(
        contractAddress,
        address,
        signer,
        (msg) => setStatus({ message: msg, type: "loading" })
      );
      // Step 2: add to LSP12IssuedAssets[] on the creator's UP
      await addToLSP12IssuedAssets(
        address,
        contractAddress,
        signer,
        (msg) => setStatus({ message: msg, type: "loading" })
      );
      setStatus({ message: "Creator verified! Badge should appear on marketplaces.", type: "success" });
    } catch (e: any) {
      setStatus({ message: friendlyRevert(e, "Verification failed"), type: "error" });
    } finally {
      setVerifying(false);
    }
  }

  const inp = "w-full bg-surface border border-border-default rounded-lg px-3 py-2.5 text-sm text-secondary focus:outline-none focus:border-pink-500 transition-colors";
  const lbl = "text-[11px] sm:text-xs text-label";
  const btn = "w-full py-2.5 sm:py-3 rounded-xl text-sm font-medium bg-pink-500/15 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500 dark:border-pink-500/30 hover:bg-pink-500 dark:hover:bg-pink-500/30 transition-all cursor-pointer active:scale-[0.97]";
  const card = "bg-card rounded-xl p-4 sm:p-6 border border-border-muted card-elevated";
  const explorerUrl = `${networkConfig.explorerBase}/address/${contractAddress}`;

  return (
    <div className={inIframe ? "px-4 py-4" : "min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4"}>
      <div className={inIframe ? "w-full max-w-xl mx-auto space-y-3 sm:space-y-4 relative" : "max-w-2xl w-full space-y-3 sm:space-y-4"}>
        {inIframe && (
          <a
            href="https://github.com/JordyDutch/issue-tracker/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-0 right-0 text-[9px] text-faint hover:text-label transition-colors z-10"
          >
            <span className="text-pink-500 font-bold">BETA</span> · Report issues
          </a>
        )}
        {/* Header card */}
        <div className={card}>
          <div className="flex items-center justify-between mb-1">
            <Link href={`/claim/${contractAddress}`} className="text-label text-xs hover:text-pink-500 transition-colors">
              ← Claim page
            </Link>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted">
              {tokenType ? (isNftStyle ? "NFT" : "Token") : "..."}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold mb-1">Manage Drop</h1>
          <p className="text-label text-xs truncate mb-2">{dropName || contractAddress}</p>

          {/* Contract address with copy + explorer */}
          <div className="flex items-center gap-2 bg-surface-subtle rounded-lg px-3 py-2 mb-3">
            <span className="text-[10px] font-mono text-label truncate flex-1">
              {contractAddress}
            </span>
            <CopyButton text={contractAddress} label="Copy" />
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-label hover:text-pink-500 transition-colors"
            >
              Explorer
            </a>
          </div>

          {/* Share claim link */}
          <button
            onClick={copyClaimLink}
            className="w-full py-2 rounded-lg text-xs font-medium border border-border-default text-muted hover:text-pink-500 hover:border-pink-500/30 transition-all cursor-pointer mb-3"
          >
            {linkCopied ? "Claim link copied!" : "Copy claim link for sharing"}
          </button>

          {!address ? (
            <button
              onClick={connect}
              className="w-full py-3 rounded-xl text-sm font-semibold border-2 border-pink-500 text-pink-500 hover:bg-pink-500/10 transition-all cursor-pointer active:scale-[0.97]"
            >
              Connect Universal Profile
            </button>
          ) : !isOwner ? (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 px-3 py-2.5 rounded-xl text-xs">
              You are not the owner of this contract. Only the owner can manage this drop.
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {profile?.image && (
                <img src={profile.image} alt="" className="w-5 h-5 rounded-full object-cover" />
              )}
              <span className="text-green-600 dark:text-green-400 text-xs">
                ✓ {profile?.name || `${address.slice(0, 6)}...${address.slice(-4)}`}
              </span>
              <button
                onClick={() => { disconnect(); setIsOwner(false); }}
                className="text-faint text-[10px] hover:text-muted ml-1 cursor-pointer"
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
                  <div className={`text-lg font-semibold ${claimEnabled ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {claimEnabled ? "Live" : "Paused"}
                  </div>
                </div>
                <div>
                  <div className={lbl + " uppercase tracking-wider"}>Claimed</div>
                  <div className="text-lg font-semibold text-pink-500 dark:text-pink-400">{totalClaimed}</div>
                </div>
                <div>
                  <div className={lbl + " uppercase tracking-wider"}>Supply</div>
                  <div className="text-lg font-semibold text-pink-500 dark:text-pink-400">
                    {maxSupply === "0" ? "Unlimited" : maxSupply}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  if (claimEnabled && !window.confirm("Are you sure you want to pause this drop?")) return;
                  sendTx(
                    (c) => c.setClaimEnabled(!claimEnabled),
                    claimEnabled ? "Pausing claims..." : "Enabling claims..."
                  );
                }}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer active:scale-[0.97] ${
                  claimEnabled
                    ? "bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-500/30 hover:bg-red-100 dark:hover:bg-red-500/30"
                    : "bg-green-50 dark:bg-green-500/20 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-500/30 hover:bg-green-100 dark:hover:bg-green-500/30"
                }`}
              >
                {claimEnabled ? "Pause Claims" : "Enable Claims"}
              </button>
            </div>

            {/* Explore visibility */}
            <div className={card}>
              <h2 className="text-xs font-semibold text-tertiary mb-1">Explore Visibility</h2>
              <p className="text-[10px] text-faint mb-3">
                Control whether this drop appears on the Explore page. Hidden drops can still be accessed via direct link.
              </p>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-semibold ${exploreVisible ? "text-green-600 dark:text-green-400" : "text-label"}`}>
                  {exploreVisible ? "Visible on Explore" : "Hidden from Explore"}
                </span>
              </div>
              <button
                onClick={() => {
                  if (exploreVisible && !window.confirm("Are you sure you want to hide this drop from Explore?")) return;
                  toggleExploreVisibility();
                }}
                disabled={visibilitySaving}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed ${
                  exploreVisible
                    ? "bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-500/30 hover:bg-red-100 dark:hover:bg-red-500/30"
                    : "bg-green-50 dark:bg-green-500/20 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-500/30 hover:bg-green-100 dark:hover:bg-green-500/30"
                }`}
              >
                {visibilitySaving ? "Saving..." : exploreVisible ? "Hide from Explore" : "Show on Explore"}
              </button>
            </div>

            {/* Claim window */}
            <div className={card}>
              <h2 className="text-xs font-semibold text-tertiary mb-3">Claim Window</h2>
              <p className="text-[10px] text-faint mb-3">
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
              <h2 className="text-xs font-semibold text-tertiary mb-1">
                {isNftStyle ? "NFTs" : "Tokens"} Per Claim
              </h2>
              <p className="text-[10px] text-faint mb-3">
                How many {isNftStyle ? "NFTs" : "tokens"} each user receives when they claim.
              </p>
              <input
                type="number"
                value={amountPerClaim}
                onChange={(e) => setAmountPerClaim(e.target.value)}
                className={inp}
                min="1"
              />
              <button
                onClick={() => {
                  // Parse human-readable back to raw units before sending to contract
                  const raw = isNftStyle
                    ? BigInt(Math.round(Number(amountPerClaim)))
                    : parseUnits(amountPerClaim || "0", tokenDecimals);
                  sendTx((c) => c.setAmountPerClaim(raw), "Updating amount...");
                }}
                className={btn + " mt-3"}
              >
                Update Amount
              </button>
            </div>

            {/* Requirements */}
            <div className={card}>
              <h2 className="text-xs font-semibold text-tertiary mb-1">Requirements</h2>
              <p className="text-[10px] text-faint mb-3">
                Set conditions users must meet before they can claim. Add up to 10 token requirements — ALL must be satisfied. Leave empty for no requirements.
              </p>
              <div className="space-y-3">
                {/* Multi-token requirements list */}
                {tokenReqs.map((req, i) => (
                  <div key={i} className="bg-surface-muted rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-label">Token requirement {i + 1}</span>
                      <button
                        type="button"
                        onClick={() => setTokenReqs((prev) => prev.filter((_, j) => j !== i))}
                        className="text-[10px] text-faint hover:text-red-400 transition-colors cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                    <TokenSearchInput
                      label="Token address (LSP7/LSP8)"
                      value={req.addr}
                      onChange={(v) => setTokenReqs((prev) => prev.map((r, j) => j === i ? { ...r, addr: v } : r))}
                    />
                    <div>
                      <label className={lbl}>Minimum balance <span className="text-faint">(min 1)</span></label>
                      <input
                        type="number"
                        value={req.amount}
                        onChange={(e) => setTokenReqs((prev) => prev.map((r, j) => j === i ? { ...r, amount: e.target.value } : r))}
                        placeholder="1"
                        min="1"
                        className={inp + " mt-1"}
                      />
                    </div>
                  </div>
                ))}
                {tokenReqs.length < 10 && (
                  <button
                    type="button"
                    onClick={() => setTokenReqs((prev) => [...prev, { addr: "", amount: "" }])}
                    className="text-xs text-pink-500 hover:text-pink-500 border border-pink-500/30 rounded-lg px-3 py-1.5 transition-colors cursor-pointer w-full"
                  >
                    + Add token requirement
                  </button>
                )}
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
                <div>
                  <label className={lbl}>Must follow UP <span className="text-faint">(optional — claimer must follow this profile)</span></label>
                  <UPSearchInput
                    value={reqFollowAddress}
                    onChange={setReqFollowAddress}
                    placeholder="Search by name or paste 0x address…"
                  />
                  {reqFollowAddress && (
                    <button
                      type="button"
                      onClick={() => setReqFollowAddress("")}
                      className="text-[10px] text-faint hover:text-red-400 transition-colors mt-1 cursor-pointer"
                    >
                      Clear follow requirement
                    </button>
                  )}
                </div>
                <button
                  onClick={() => {
                    const activeTokenReqs = tokenReqs.filter((r) => r.addr && r.addr !== ZERO);
                    const invalidTokenReqs = activeTokenReqs.filter((r) => !r.amount || Number(r.amount) < 1);
                    if (invalidTokenReqs.length > 0) {
                      setStatus({ message: "Token requirements must have a minimum balance of at least 1", type: "error" });
                      return;
                    }
                    const tokens = activeTokenReqs.map((r) => r.addr);
                    const amounts = activeTokenReqs.map((r) => r.amount);
                    sendTx(
                      (c) => c.setRequirements(tokens, amounts, reqFollowers || "0", reqFollowAddress || ZERO),
                      "Updating requirements..."
                    );
                  }}
                  className={btn}
                >
                  Update Requirements
                </button>
              </div>
            </div>
            {/* Codeword */}
            <div className={card}>
              <h2 className="text-xs font-semibold text-tertiary mb-1">Codeword</h2>
              <p className="text-[10px] text-faint mb-3">
                Require claimers to enter a secret word — say it in a livestream. Only the keccak256 hash is stored on-chain, not the plaintext.
              </p>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold ${codewordEnabled ? "text-green-600 dark:text-green-400" : "text-label"}`}>
                  {codewordEnabled ? "🔑 Codeword active" : "No codeword set"}
                </span>
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={codewordInput}
                  onChange={(e) => setCodewordInput(e.target.value)}
                  placeholder="e.g. LUKSOAGENT"
                  className={inp + " tracking-widest"}
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="text-[10px] text-faint">
                  Use a longer passphrase for better security. Empty = clear codeword.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (!codewordInput.trim()) {
                        setStatus({ message: "Enter a codeword or use Clear to remove it", type: "error" });
                        return;
                      }
                      sendTx((c) => c.setCodeword(codewordInput.trim()), "Setting codeword...");
                    }}
                    className={btn + " flex-1"}
                  >
                    Set Codeword
                  </button>
                  {codewordEnabled && (
                    <button
                      onClick={() => {
                        if (!window.confirm("Are you sure you want to clear the codeword?")) return;
                        sendTx((c) => c.setCodeword(""), "Clearing codeword...");
                      }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-border-default text-muted hover:border-red-500/30 hover:text-red-400 transition-all cursor-pointer"
                    >
                      Clear Codeword
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* LSP4 Metadata */}
            <div className={card}>
              <h2 className="text-xs font-semibold text-tertiary mb-1">Metadata (LSP4)</h2>
              <p className="text-[10px] text-faint mb-3">
                Set icon and description shown on the claim page. Uploaded to IPFS — requires Pinata JWT configured server-side.
              </p>
              <div className="space-y-3">
                {/* Icon */}
                <div>
                  <label className={lbl}>Icon</label>
                  <div className="flex items-center gap-3 mt-1">
                    {metaIconPreview ? (
                      <img
                        src={metaIconPreview}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover border border-border-default cursor-pointer hover:opacity-50 transition-opacity"
                        title="Click to remove"
                        onClick={() => { setMetaIconFile(null); setMetaIconPreview(null); setExistingIcon(null); if (metaIconRef.current) metaIconRef.current.value = ""; }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-surface border border-border-default flex items-center justify-center text-faint text-xs">IMG</div>
                    )}
                    <button
                      type="button"
                      onClick={() => metaIconRef.current?.click()}
                      className="text-xs text-pink-500 hover:text-pink-500 border border-pink-500/30 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
                    >
                      {metaIconFile ? "Change" : "Upload"}
                    </button>
                    {metaIconFile && (
                      <button
                        type="button"
                        onClick={() => { setMetaIconFile(null); setMetaIconPreview(null); if (metaIconRef.current) metaIconRef.current.value = ""; }}
                        className="text-xs text-label hover:text-red-400 transition-colors cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    ref={metaIconRef}
                    type="file"
                    accept="image/jpeg,image/png,image/svg+xml,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setMetaIconFile(file);
                      if (file) setMetaIconPreview(URL.createObjectURL(file));
                      else setMetaIconPreview(null);
                    }}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className={lbl}>Description</label>
                  <textarea
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value)}
                    placeholder="What is this drop about?"
                    rows={3}
                    className={inp + " resize-none mt-1"}
                  />
                </div>

                {/* Links */}
                <div>
                  <label className={lbl}>Links</label>
                  <div className="space-y-2 mt-1">
                    {metaLinks.map((link, i) => (
                      <div key={i} className="bg-surface-muted rounded-lg p-2 space-y-1.5">
                        <input
                          value={link.title}
                          onChange={(e) => setMetaLinks((prev) => prev.map((l, j) => j === i ? { ...l, title: e.target.value } : l))}
                          placeholder="Label (e.g. Website)"
                          className={inp}
                        />
                        <input
                          value={link.url}
                          onChange={(e) => setMetaLinks((prev) => prev.map((l, j) => j === i ? { ...l, url: e.target.value } : l))}
                          placeholder="https://..."
                          className={inp}
                        />
                        {metaLinks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setMetaLinks((prev) => prev.filter((_, j) => j !== i))}
                            className="text-[10px] text-faint hover:text-red-400 transition-colors cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setMetaLinks((prev) => [...prev, { title: "", url: "" }])}
                    className="text-xs text-pink-500 hover:text-pink-500 mt-2 cursor-pointer"
                  >
                    + Add link
                  </button>
                </div>

                {/* Assets */}
                <div>
                  <label className={lbl}>Assets</label>
                  <span className="text-[10px] text-faint block mb-1.5">
                    Attach files to the token (images, documents, media). Uploaded to IPFS.
                  </span>
                  {metaAssetFiles.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {metaAssetFiles.map((file, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between bg-surface-muted rounded-lg px-3 py-2"
                        >
                          <span className="text-xs text-tertiary truncate flex-1 mr-2">
                            {file.name}
                          </span>
                          <span className="text-[10px] text-faint mr-2 flex-shrink-0">
                            {(file.size / 1024).toFixed(0)} KB
                          </span>
                          <button
                            type="button"
                            onClick={() => removeMetaAsset(i)}
                            className="text-[10px] text-faint hover:text-red-400 transition-colors cursor-pointer flex-shrink-0"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => metaAssetRef.current?.click()}
                    className="text-xs text-pink-500 hover:text-pink-500 border border-pink-500/30 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
                  >
                    + Add asset file
                  </button>
                  <input
                    ref={metaAssetRef}
                    type="file"
                    multiple
                    onChange={handleMetaAssetFiles}
                    className="hidden"
                  />
                </div>

                <button
                  onClick={updateMetadata}
                  disabled={metaSaving || !metaDescription.trim() || (!metaIconFile && !existingIcon)}
                  className={btn + " disabled:opacity-50 disabled:cursor-not-allowed"}
                >
                  {metaSaving ? "Saving..." : "Save Metadata"}
                </button>
              </div>
            </div>

            {/* Verified creator */}
            <div className={card}>
              <h2 className="text-sm font-semibold mb-1">Verified Creator</h2>
              <p className="text-label text-xs mb-3">
                Sets <span className="text-tertiary">LSP4Creators[]</span> on this contract and adds it to your UP&apos;s <span className="text-tertiary">LSP12IssuedAssets[]</span>. Removes the &quot;Un-verified creators&quot; badge on marketplaces. Requires 2 wallet confirmations.
              </p>
              <button
                onClick={verifyCreator}
                disabled={verifying}
                className={btn + " disabled:opacity-50 disabled:cursor-not-allowed"}
              >
                {verifying ? "Verifying..." : "✓ Set as Verified Creator"}
              </button>
            </div>
          </>
        )}

        {/* Status toast — fixed overlay, visible regardless of scroll position */}
        {status && (
          <div
            className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm px-4 py-3 rounded-xl text-xs sm:text-sm shadow-xl shadow-black/40 transition-all flex items-center justify-between gap-3 ${
              status.type === "success"
                ? "bg-toast-success border border-green-300 dark:border-green-500/30 text-green-700 dark:text-green-400"
                : status.type === "error"
                ? "bg-toast-error border border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-400"
                : "bg-dropdown border border-pink-500 dark:border-pink-500/30 text-pink-500 dark:text-pink-400"
            }`}
          >
            <span className="flex-1">
              {status.link ? (
                <a href={status.link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {status.message}
                </a>
              ) : status.message}
            </span>
            {status.type === "error" && (
              <button
                onClick={() => setStatus(null)}
                className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer text-base leading-none"
                aria-label="Dismiss"
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* Footer nav */}
        <div className="flex justify-between px-2 pb-4">
          <Link href="/" className="text-faint text-[10px] sm:text-xs hover:text-pink-500 transition-colors">
            ← All drops
          </Link>
          {!inIframe && <Footer />}
        </div>
      </div>
    </div>
  );
}
