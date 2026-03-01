"use client";

import { useState, useRef } from "react";
import { BrowserProvider, Contract } from "ethers";
import {
  LSP7_FACTORY_ABI,
  getProvider,
} from "../lib/contracts";
import { uploadAndSetLSP4Metadata, addToLSP12IssuedAssets, type Lsp4Link } from "../lib/lsp4";
import Link from "next/link";
import CopyButton from "../components/CopyButton";
import Footer from "../components/Footer";
import { useWallet } from "../components/WalletProvider";
import { useNetwork } from "../components/NetworkProvider";
import { useUPProvider } from "../components/UPProviderInit";
import TokenSearchInput from "../components/TokenSearchInput";
import UPSearchInput from "../components/UPSearchInput";

type Status = { message: string; type: "success" | "error" | "loading" } | null;

export default function CreatePage() {
  const { address, profile, connect: walletConnect, disconnect } = useWallet();
  const { config: networkConfig } = useNetwork();
  const { inIframe } = useUPProvider();
  const [status, setStatus] = useState<Status>(null);
  const [dropType, setDropType] = useState<"token" | "nft" | "secret">("nft");

  // Secret Drop state
  const [secretTitle, setSecretTitle] = useState("");
  const [secretDescription, setSecretDescription] = useState("");
  const [secretCodesRaw, setSecretCodesRaw] = useState(""); // newline-separated
  const [secretUsageLimit, setSecretUsageLimit] = useState("1");
  // minBalance is display amount — multiplied by 10^18 on submit (assumes 18-decimal tokens)
  const [secretTokenReqs, setSecretTokenReqs] = useState<Array<{ address: string; minBalance: string }>>([]);
  const [secretMinFollowers, setSecretMinFollowers] = useState("0");
  const [secretFollowAddress, setSecretFollowAddress] = useState("");
  const [secretIsPublic, setSecretIsPublic] = useState(false);
  const [secretImageFile, setSecretImageFile] = useState<File | null>(null);
  const [secretImagePreview, setSecretImagePreview] = useState<string | null>(null);
  const [secretDropId, setSecretDropId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [maxSupply, setMaxSupply] = useState("100");
  const [amountPerClaim, setAmountPerClaim] = useState("1");
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);

  // LSP4 metadata fields
  const [description, setDescription] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [links, setLinks] = useState<Lsp4Link[]>([{ title: "", url: "" }]);
  const [assetFiles, setAssetFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const assetRef = useRef<HTMLInputElement>(null);
  const secretImageRef = useRef<HTMLInputElement>(null);

  function handleIconChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setIconFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setIconPreview(url);
    } else {
      setIconPreview(null);
    }
  }

  function updateLink(index: number, field: "title" | "url", value: string) {
    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  function addLink() {
    setLinks((prev) => [...prev, { title: "", url: "" }]);
  }

  function removeLink(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAssetFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files ?? []);
    if (newFiles.length === 0) return;
    setAssetFiles((prev) => [...prev, ...newFiles]);
    // Reset input after state update to avoid sync interference
    const input = e.target;
    setTimeout(() => { input.value = ""; }, 0);
  }

  function removeAsset(index: number) {
    setAssetFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function connect() {
    setStatus({ message: "Connecting...", type: "loading" });
    const addr = await walletConnect();
    if (!addr) {
      setStatus({ message: "Install the Universal Profile Browser Extension", type: "error" });
      return;
    }
    setStatus(null);
  }

  async function deploy() {
    const p = getProvider();
    if (!p || !address || !name || !symbol || !description.trim() || !iconFile) {
      setStatus({ message: "Please fill in all required fields", type: "error" });
      return;
    }
    try {
      setDeploying(true);
      setStatus({ message: "Creating your drop... confirm in your wallet", type: "loading" });
      const provider = new BrowserProvider(p);
      const signer = await provider.getSigner();
      let deployedAddr: string;

      {
        const factory = new Contract(networkConfig.lsp7Factory, LSP7_FACTORY_ABI, signer);
        const nonDivisible = dropType === "nft";
        const tx = await factory.createTokenDrop(name, symbol, amountPerClaim, maxSupply, nonDivisible);
        setStatus({ message: "Waiting for confirmation...", type: "loading" });
        await tx.wait();
        const fr = new Contract(networkConfig.lsp7Factory, LSP7_FACTORY_ABI, provider);
        const t = await fr.totalCampaigns();
        const items = await fr.getCampaigns(t - BigInt(1), 1);
        deployedAddr = items[0].contractAddr;
      }

      // LSP4 metadata — always set
      const validLinks = links.filter((l) => l.title.trim() && l.url.trim());

      // Step 2: LSP4 metadata + LSP4Creators[] in one tx
      await uploadAndSetLSP4Metadata(
        deployedAddr,
        signer,
        {
          name,
          description: description.trim(),
          iconFile,
          links: validLinks,
          assetFiles: assetFiles.length > 0 ? assetFiles : undefined,
        },
        (msg) => setStatus({ message: msg, type: "loading" }),
        address,  // sets LSP4Creators[] on the contract
      );

      // Step 3: LSP12IssuedAssets[] on creator's UP → "Verified creator" badge
      await addToLSP12IssuedAssets(
        address,
        deployedAddr,
        signer,
        (msg) => setStatus({ message: msg, type: "loading" })
      );

      setDeployedAddress(deployedAddr);
      setStatus({ message: "Drop created!", type: "success" });
    } catch (e: any) {
      setStatus({ message: e.reason || e.message?.slice(0, 120) || "Deploy failed", type: "error" });
    } finally {
      setDeploying(false);
    }
  }

  // Secret Drop submit
  async function createSecretDrop() {
    const p = getProvider();
    if (!p || !address) return;
    const codes = secretCodesRaw
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
    if (!secretTitle.trim()) { setStatus({ message: "Title required", type: "error" }); return; }
    if (codes.length === 0) { setStatus({ message: "Add at least one code", type: "error" }); return; }
    try {
      setDeploying(true);
      setStatus({ message: "Sign in your wallet…", type: "loading" });
      const { BrowserProvider } = await import("ethers");
      const provider = new BrowserProvider(p);
      const signer = await provider.getSigner();
      const ts = Math.floor(Date.now() / 1000);
      const message = `Create secret drop as ${address} at ${ts}`;
      const signature = await signer.signMessage(message);
      // Upload image to IPFS if provided
      let imageCid: string | null = null;
      if (secretImageFile) {
        setStatus({ message: "Uploading image…", type: "loading" });
        const form = new FormData();
        form.append("file", secretImageFile, secretImageFile.name);
        const uploadRes = await fetch("/api/ipfs", { method: "POST", body: form });
        if (!uploadRes.ok) { setStatus({ message: "Image upload failed", type: "error" }); setDeploying(false); return; }
        const { IpfsHash } = await uploadRes.json();
        imageCid = IpfsHash;
      }

      setStatus({ message: "Creating drop…", type: "loading" });
      const tokenRequirements = secretTokenReqs
        .filter((r) => r.address.startsWith("0x") && r.address.length === 42)
        .map((r) => ({
          address: r.address,
          // Convert display amount to raw token units (18 decimals assumed).
          // Amount "0" means "just hold any".
          minBalance: r.minBalance && Number(r.minBalance) > 0
            ? (BigInt(Math.round(Number(r.minBalance) * 1e18))).toString()
            : "0",
        }));
      const followerRequirement = secretFollowAddress.startsWith("0x") && secretFollowAddress.length === 42
        ? { followAddress: secretFollowAddress }
        : null;
      const res = await fetch("/api/secret-drop/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          signature,
          title: secretTitle.trim(),
          description: secretDescription.trim(),
          codes,
          codeUsageLimit: Number(secretUsageLimit) || 1,
          network: networkConfig.id,
          tokenRequirements,
          followerRequirement,
          minFollowers: Number(secretMinFollowers) || 0,
          isPublic: secretIsPublic,
          image: imageCid,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus({ message: data.error ?? "Failed", type: "error" }); return; }
      setSecretDropId(data.id);
      setStatus(null);
    } catch (e: any) {
      if (e?.code === 4001 || e?.code === "ACTION_REJECTED") {
        setStatus({ message: "Signature rejected", type: "error" });
      } else {
        setStatus({ message: e?.message ?? "Something went wrong", type: "error" });
      }
    } finally {
      setDeploying(false);
    }
  }

  const inp =
    "w-full bg-surface border border-border-default rounded-lg px-3 py-2.5 text-sm text-secondary focus:outline-none focus:border-purple-400 transition-colors";
  const lbl = "text-[11px] sm:text-xs text-label mb-1 block";
  const card = "bg-card rounded-xl p-5 sm:p-8 border border-border-muted card-elevated";

  // Secret Drop success screen
  if (secretDropId) {
    const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/secret-drop/${secretDropId}`;
    return (
      <div className={inIframe ? "px-4 py-4" : "min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4"}>
        <div className={card + (inIframe ? " max-w-xl w-full mx-auto text-center" : " max-w-lg w-full text-center")}>
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-400/10 border border-violet-500/20 flex items-center justify-center text-4xl mx-auto mb-4">
            🔐
          </div>
          <h1 className="text-xl sm:text-2xl font-bold mb-2">Secret Drop Created!</h1>
          <p className="text-muted text-sm mb-6">
            Share the link — codes are safe off-chain and only revealed after verification
          </p>
          <div className="bg-surface-subtle rounded-xl p-3 mb-6">
            <p className="text-[10px] text-label mb-1">Claim Link</p>
            <p className="text-xs font-mono text-violet-400 break-all mb-2">{shareUrl}</p>
            <CopyButton text={shareUrl} label="Copy link" />
          </div>
          <Link href="/" className="block text-label text-xs hover:text-purple-400 transition-colors">
            ← All drops
          </Link>
        </div>
      </div>
    );
  }

  // Regular on-chain success screen
  if (deployedAddress) {
    return (
      <div className={inIframe ? "px-4 py-4" : "min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4"}>
        <div className={card + (inIframe ? " max-w-xl w-full mx-auto text-center" : " max-w-lg w-full text-center")}>
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-400/10 border border-green-500/20 flex items-center justify-center text-4xl mx-auto mb-4">
            ✓
          </div>
          <h1 className="text-xl sm:text-2xl font-bold mb-2">Drop Created!</h1>
          <p className="text-muted text-sm mb-6">
            Your {dropType === "nft" ? "NFT" : "token"} drop is live on LUKSO
          </p>

          <div className="bg-surface-subtle rounded-xl p-3 mb-4">
            <p className="text-[10px] text-label mb-1">Contract Address</p>
            <p className="text-xs font-mono text-purple-400 break-all mb-2">{deployedAddress}</p>
            <div className="flex items-center justify-center gap-3">
              <CopyButton text={deployedAddress} label="Copy address" />
              <a
                href={`${networkConfig.explorerBase}/address/${deployedAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-label hover:text-purple-400 transition-colors"
              >
                View on Explorer
              </a>
            </div>
          </div>

          <div className="bg-surface-muted rounded-xl p-3 mb-6">
            <p className="text-[10px] text-label mb-1">Claim Link</p>
            <p className="text-xs font-mono text-muted break-all mb-2">
              {typeof window !== "undefined" ? `${window.location.origin}/claim/${deployedAddress}` : `/claim/${deployedAddress}`}
            </p>
            <CopyButton
              text={typeof window !== "undefined" ? `${window.location.origin}/claim/${deployedAddress}` : `/claim/${deployedAddress}`}
              label="Copy claim link"
            />
          </div>

          <div className="space-y-3">
            <Link
              href={`/manage/${deployedAddress}`}
              className="block w-full py-3 rounded-xl text-sm font-semibold bg-purple-500 text-white hover:bg-purple-600 transition-all active:scale-[0.97]"
            >
              Manage Drop →
            </Link>
            <Link
              href={`/claim/${deployedAddress}`}
              className="block w-full py-3 rounded-xl text-sm font-semibold border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-all active:scale-[0.97]"
            >
              View Claim Page →
            </Link>
            <Link href="/" className="block text-label text-xs hover:text-purple-400 mt-4 transition-colors">
              ← All drops
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Validation
  const nameValid = name.trim().length > 0;
  const symbolValid = symbol.trim().length > 0;
  const supplyValid = maxSupply === "" || maxSupply === "0" || Number(maxSupply) > 0;
  const amountValid = Number(amountPerClaim) >= 1;
  const descriptionValid = description.trim().length > 0;
  const iconValid = iconFile !== null;
  const canDeploy = nameValid && symbolValid && supplyValid && amountValid && descriptionValid && iconValid && !deploying;

  return (
    <div className={inIframe ? "px-4 py-4" : "min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4"}>
      <div className={inIframe ? "w-full max-w-xl mx-auto space-y-4 relative" : "max-w-2xl w-full space-y-4"}>
        {inIframe && (
          <a
            href="https://github.com/JordyDutch/issue-tracker/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-0 right-0 text-[9px] text-faint hover:text-label transition-colors z-10"
          >
            <span className="text-purple-500 font-bold">BETA</span> · Report issues
          </a>
        )}
        <div className={card}>
          <Link href="/" className="text-label text-xs hover:text-purple-400 transition-colors">
            ← Back
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold mt-2 mb-1">Create a Drop</h1>
          <p className="text-label text-xs sm:text-sm mb-6">
            Deploy your own token or NFT claim campaign on LUKSO
          </p>

          {!address ? (
            <button
              onClick={connect}
              className="w-full py-3.5 rounded-xl text-sm font-semibold border-2 border-purple-400 text-purple-400 hover:bg-purple-400/10 transition-all cursor-pointer active:scale-[0.97]"
            >
              Connect Universal Profile
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-6">
                {profile?.image && (
                  <img src={profile.image} alt="" className="w-5 h-5 rounded-full object-cover" />
                )}
                <span className="text-tertiary text-xs">
                  {profile?.name || `${address.slice(0, 6)}...${address.slice(-4)}`}
                </span>
                <button
                  onClick={disconnect}
                  className="text-faint text-[10px] hover:text-muted ml-1 cursor-pointer"
                >
                  Disconnect
                </button>
              </div>

              {/* Drop type */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setDropType("nft")}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    dropType === "nft"
                      ? "bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-300 dark:border-purple-500/30"
                      : "bg-surface text-muted border border-border-default"
                  }`}
                >
                  🖼 NFT Drop
                </button>
                <button
                  onClick={() => setDropType("token")}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    dropType === "token"
                      ? "bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-300 dark:border-purple-500/30"
                      : "bg-surface text-muted border border-border-default"
                  }`}
                >
                  🪙 Token Drop
                </button>
                <button
                  onClick={() => setDropType("secret")}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    dropType === "secret"
                      ? "bg-violet-50 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400 border border-violet-300 dark:border-violet-500/30"
                      : "bg-surface text-muted border border-border-default"
                  }`}
                >
                  🔐 Secret Drop
                </button>
              </div>

              {/* Core fields — NFT / Token only */}
              {dropType !== "secret" && (<div className="space-y-3">
                <div>
                  <label className={lbl}>Name *</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Awesome Drop"
                    className={`${inp} ${name && !nameValid ? "border-red-500/50" : ""}`}
                  />
                </div>
                <div>
                  <label className={lbl}>Symbol *</label>
                  <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="DROP"
                    className={`${inp} ${symbol && !symbolValid ? "border-red-500/50" : ""}`}
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className={lbl}>Max Supply</label>
                  <input
                    type="number"
                    value={maxSupply}
                    onChange={(e) => setMaxSupply(e.target.value)}
                    className={inp}
                    min="0"
                  />
                  <span className="text-[10px] text-faint mt-0.5 block">
                    Set to 0 for unlimited supply
                  </span>
                </div>
                <div>
                  <label className={lbl}>
                    {dropType === "nft" ? "NFTs per claim" : "Tokens per claim"}
                  </label>
                  <input
                    type="number"
                    value={amountPerClaim}
                    onChange={(e) => setAmountPerClaim(e.target.value)}
                    className={inp}
                    min="1"
                  />
                </div>

                {/* LSP4 Metadata */}
                <div className="border-t border-border-muted pt-4 mt-1">
                  <p className="text-xs font-semibold text-tertiary mb-3">Metadata</p>

                  {/* Icon upload */}
                  <div className="mb-3">
                    <label className={lbl}>Icon *</label>
                    <div className="flex items-center gap-3">
                      {iconPreview ? (
                        <img
                          src={iconPreview}
                          alt="Icon preview"
                          className="w-10 h-10 rounded-lg object-cover border border-border-default"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-surface border border-border-default flex items-center justify-center text-faint text-sm">
                          IMG
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
                      >
                        {iconFile ? "Change image" : "Upload image"}
                      </button>
                      {iconFile && (
                        <button
                          type="button"
                          onClick={() => {
                            setIconFile(null);
                            setIconPreview(null);
                            if (fileRef.current) fileRef.current.value = "";
                          }}
                          className="text-xs text-label hover:text-red-400 transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      onChange={handleIconChange}
                      className="hidden"
                    />
                    {iconFile && (
                      <p className="text-[10px] text-faint mt-1">{iconFile.name}</p>
                    )}
                  </div>

                  {/* Description */}
                  <div className="mb-3">
                    <label className={lbl}>Description *</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What is this drop about?"
                      rows={3}
                      className={inp + " resize-none"}
                    />
                  </div>

                  {/* Links */}
                  <div className="mb-3">
                    <label className={lbl}>Links</label>
                    <div className="space-y-2">
                      {links.map((link, i) => (
                        <div key={i} className="bg-surface-muted rounded-lg p-2.5 space-y-1.5">
                          <input
                            value={link.title}
                            onChange={(e) => updateLink(i, "title", e.target.value)}
                            placeholder="Label (e.g. Website, Twitter)"
                            className={inp}
                            maxLength={30}
                          />
                          <input
                            value={link.url}
                            onChange={(e) => updateLink(i, "url", e.target.value)}
                            placeholder="https://..."
                            className={inp}
                          />
                          {links.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLink(i)}
                              className="text-[10px] text-faint hover:text-red-400 transition-colors cursor-pointer"
                            >
                              Remove link
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={addLink}
                      className="text-xs text-purple-400 hover:text-purple-300 mt-2 cursor-pointer"
                    >
                      + Add link
                    </button>
                  </div>

                  {/* Assets */}
                  <div className="mb-3">
                    <label className={lbl}>Assets</label>
                    <span className="text-[10px] text-faint block mb-1.5">
                      Attach files to the token (images, documents, media). Uploaded to IPFS.
                    </span>
                    {assetFiles.length > 0 && (
                      <div className="space-y-1.5 mb-2">
                        {assetFiles.map((file, i) => (
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
                              onClick={() => removeAsset(i)}
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
                      onClick={() => assetRef.current?.click()}
                      className="text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
                    >
                      + Add asset file
                    </button>
                    <input
                      ref={assetRef}
                      type="file"
                      multiple
                      onChange={handleAssetFiles}
                      className="hidden"
                    />
                  </div>

                  <p className="text-[10px] text-faint">
                    Metadata is uploaded to IPFS and stored on-chain via a second wallet confirmation after deployment.
                  </p>
                </div>

                <button
                  onClick={deploy}
                  disabled={!canDeploy}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold bg-purple-500 text-white hover:bg-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.97] mt-2"
                >
                  {deploying ? "Deploying..." : `Create ${dropType === "nft" ? "NFT" : "Token"} Drop`}
                </button>
              </div>
              )}

              {/* ── Secret Drop Form ── */}
              {dropType === "secret" && (
                <div className="space-y-4 mt-2">
                  <div className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-xl px-4 py-3 text-xs text-violet-700 dark:text-violet-300">
                    Codes and links are stored off-chain. Only verified claimers receive them — nothing is readable on-chain.
                  </div>

                  <div>
                    <label className={lbl}>Title *</label>
                    <input value={secretTitle} onChange={(e) => setSecretTitle(e.target.value)}
                      placeholder="VIP Discount Code Drop"
                      className={inp} />
                  </div>

                  <div>
                    <label className={lbl}>Description (shown to claimers — don&apos;t put the codes here)</label>
                    <textarea value={secretDescription} onChange={(e) => setSecretDescription(e.target.value)}
                      placeholder="Claim your exclusive 30% discount code…"
                      rows={2} className={`${inp} resize-none`} />
                  </div>

                  <div>
                    <label className={lbl}>Codes / Links * — one per line</label>
                    <textarea value={secretCodesRaw} onChange={(e) => setSecretCodesRaw(e.target.value)}
                      placeholder={"DISCOUNT-A1B2\nDISCOUNT-C3D4\nhttps://meet.example.com/vip-room"}
                      rows={5} className={`${inp} font-mono text-xs resize-y`} />
                    <p className="text-[10px] text-faint mt-1">
                      {secretCodesRaw.split("\n").filter((l) => l.trim()).length} code(s)
                    </p>
                  </div>

                  <div>
                    <label className={lbl}>Max uses per code <span className="text-faint">(1 = unique per person, higher = reusable)</span></label>
                    <input type="number" min="1" value={secretUsageLimit}
                      onChange={(e) => setSecretUsageLimit(e.target.value)}
                      className={inp} />
                  </div>

                  {/* Token requirements */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className={lbl + " mb-0"}>Token Requirements <span className="text-faint">(optional)</span></label>
                      <button type="button"
                        onClick={() => setSecretTokenReqs((prev) => [...prev, { address: "", minBalance: "1" }])}
                        className="text-[10px] text-purple-400 hover:text-purple-300 border border-purple-500/20 rounded-md px-2 py-1"
                      >+ Add token</button>
                    </div>
                    {secretTokenReqs.length === 0 && (
                      <p className="text-[11px] text-faint mb-1">No token requirement — anyone with a UP can claim</p>
                    )}
                    {secretTokenReqs.map((req, i) => (
                      <div key={i} className="mb-3 bg-surface-subtle border border-border-muted rounded-xl p-3 space-y-2">
                        <div>
                          <label className={lbl}>Token</label>
                          <TokenSearchInput
                            value={req.address}
                            onChange={(addr) => setSecretTokenReqs((prev) => prev.map((r, j) => j === i ? { ...r, address: addr } : r))}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className={lbl}>Min amount to hold <span className="text-faint">(0 = just hold any)</span></label>
                            <input type="number" min="0" placeholder="0"
                              value={req.minBalance}
                              onChange={(e) => setSecretTokenReqs((prev) => prev.map((r, j) => j === i ? { ...r, minBalance: e.target.value } : r))}
                              className={inp} />
                          </div>
                          <button type="button"
                            onClick={() => setSecretTokenReqs((prev) => prev.filter((_, j) => j !== i))}
                            className="mt-5 text-red-400 hover:text-red-300 text-xs border border-red-500/20 rounded-md px-2 py-1.5">
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Follower requirements */}
                  <div className="space-y-3">
                    <div>
                      <label className={lbl}>Minimum followers <span className="text-faint">(0 = no requirement)</span></label>
                      <input type="number" min="0" value={secretMinFollowers}
                        onChange={(e) => setSecretMinFollowers(e.target.value)}
                        className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Must follow UP <span className="text-faint">(optional — search by name)</span></label>
                      <UPSearchInput
                        value={secretFollowAddress}
                        onChange={setSecretFollowAddress}
                        placeholder="Search by name or paste 0x address…"
                      />
                    </div>
                  </div>

                  {/* Image upload */}
                  <div>
                    <label className={lbl}>Drop Image <span className="text-faint">(optional — shown on Explore and claim page)</span></label>
                    <div className="flex items-center gap-3">
                      {secretImagePreview ? (
                        <img
                          src={secretImagePreview}
                          alt="Preview"
                          className="w-10 h-10 rounded-lg object-cover border border-border-default"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-surface border border-border-default flex items-center justify-center text-faint text-sm">
                          🔒
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => secretImageRef.current?.click()}
                        className="text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
                      >
                        {secretImageFile ? "Change image" : "Upload image"}
                      </button>
                      {secretImageFile && (
                        <button
                          type="button"
                          onClick={() => {
                            setSecretImageFile(null);
                            setSecretImagePreview(null);
                            if (secretImageRef.current) secretImageRef.current.value = "";
                          }}
                          className="text-xs text-label hover:text-red-400 transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      ref={secretImageRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setSecretImageFile(file);
                        setSecretImagePreview(file ? URL.createObjectURL(file) : null);
                      }}
                      className="hidden"
                    />
                    {secretImageFile && (
                      <p className="text-[10px] text-faint mt-1">{secretImageFile.name}</p>
                    )}
                  </div>

                  {/* Show on Explore toggle */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSecretIsPublic(!secretIsPublic)}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                        secretIsPublic ? "bg-violet-500" : "bg-surface-hover"
                      }`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        secretIsPublic ? "translate-x-5" : "translate-x-0.5"
                      }`} />
                    </button>
                    <div>
                      <span className="text-xs text-secondary">Show on Explore page</span>
                      <p className="text-[10px] text-faint">
                        {secretIsPublic ? "Anyone can discover this drop" : "Only accessible via direct link"}
                      </p>
                    </div>
                  </div>

                  {status && (
                    <div className={`px-3 py-2 rounded-lg text-xs ${
                      status.type === "error" ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20" :
                      status.type === "success" ? "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20" :
                      "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20"}`}>
                      {status.message}
                    </div>
                  )}

                  <button
                    onClick={createSecretDrop}
                    disabled={deploying || !secretTitle.trim() || secretCodesRaw.split("\n").filter((l) => l.trim()).length === 0}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.97] mt-2"
                  >
                    {deploying ? "Creating…" : "Create Secret Drop"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {status && (
          <div
            className={`px-3 py-2.5 rounded-xl text-xs sm:text-sm ${
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

        {!inIframe && <Footer />}
      </div>
    </div>
  );
}
