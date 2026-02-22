"use client";

import { useState, useRef } from "react";
import { BrowserProvider, Contract } from "ethers";
import {
  LSP7_FACTORY, LSP8_FACTORY, LSP7_FACTORY_ABI, LSP8_FACTORY_ABI,
  getProvider,
} from "../lib/contracts";
import { uploadAndSetLSP4Metadata, addToLSP12IssuedAssets, type Lsp4Link } from "../lib/lsp4";
import Link from "next/link";
import CopyButton from "../components/CopyButton";
import Footer from "../components/Footer";
import { useWallet } from "../components/WalletProvider";

type Status = { message: string; type: "success" | "error" | "loading" } | null;

export default function CreatePage() {
  const { address, profile, connect: walletConnect, disconnect } = useWallet();
  const [status, setStatus] = useState<Status>(null);
  const [dropType, setDropType] = useState<"token" | "nft">("nft");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [maxSupply, setMaxSupply] = useState("100");
  const [amountPerClaim, setAmountPerClaim] = useState("1");
  const [isNonDivisible, setIsNonDivisible] = useState(true);
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

      if (dropType === "token") {
        const factory = new Contract(LSP7_FACTORY, LSP7_FACTORY_ABI, signer);
        const tx = await factory.createTokenDrop(name, symbol, amountPerClaim, maxSupply, isNonDivisible);
        setStatus({ message: "Waiting for confirmation...", type: "loading" });
        await tx.wait();
        const fr = new Contract(LSP7_FACTORY, LSP7_FACTORY_ABI, provider);
        const t = await fr.totalTokenCampaigns();
        const items = await fr.getTokenCampaigns(t - BigInt(1), 1);
        deployedAddr = items[0].contractAddr;
      } else {
        const factory = new Contract(LSP8_FACTORY, LSP8_FACTORY_ABI, signer);
        const tx = await factory.createNFTDrop(name, symbol, maxSupply, amountPerClaim);
        setStatus({ message: "Waiting for confirmation...", type: "loading" });
        await tx.wait();
        const fr = new Contract(LSP8_FACTORY, LSP8_FACTORY_ABI, provider);
        const t = await fr.totalNFTCampaigns();
        const items = await fr.getNFTCampaigns(t - BigInt(1), 1);
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

  const inp =
    "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-purple-400 transition-colors";
  const lbl = "text-[11px] sm:text-xs text-zinc-500 mb-1 block";
  const card = "bg-[#12121a] rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-purple-500/10";

  // Success screen
  if (deployedAddress) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4">
        <div className={card + " max-w-md w-full text-center"}>
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-400/10 border border-green-500/20 flex items-center justify-center text-4xl mx-auto mb-4">
            ✓
          </div>
          <h1 className="text-xl sm:text-2xl font-bold mb-2">Drop Created!</h1>
          <p className="text-zinc-400 text-sm mb-6">
            Your {dropType === "nft" ? "NFT" : "token"} drop is live on LUKSO
          </p>

          <div className="bg-zinc-800/50 rounded-xl p-3 mb-4">
            <p className="text-[10px] text-zinc-500 mb-1">Contract Address</p>
            <p className="text-xs font-mono text-purple-400 break-all mb-2">{deployedAddress}</p>
            <div className="flex items-center justify-center gap-3">
              <CopyButton text={deployedAddress} label="Copy address" />
              <a
                href={`https://explorer.execution.mainnet.lukso.network/address/${deployedAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-zinc-500 hover:text-purple-400 transition-colors"
              >
                View on Explorer
              </a>
            </div>
          </div>

          <div className="bg-zinc-800/30 rounded-xl p-3 mb-6">
            <p className="text-[10px] text-zinc-500 mb-1">Claim Link</p>
            <p className="text-xs font-mono text-zinc-400 break-all mb-2">
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
            <Link href="/" className="block text-zinc-500 text-xs hover:text-purple-400 mt-4 transition-colors">
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
    <div className="min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4">
      <div className="max-w-md w-full space-y-4">
        <div className={card}>
          <Link href="/" className="text-zinc-500 text-xs hover:text-purple-400 transition-colors">
            ← Back
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold mt-2 mb-1">Create a Drop</h1>
          <p className="text-zinc-500 text-xs sm:text-sm mb-6">
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
                <span className="text-zinc-300 text-xs">
                  {profile?.name || `${address.slice(0, 6)}...${address.slice(-4)}`}
                </span>
                <button
                  onClick={disconnect}
                  className="text-zinc-600 text-[10px] hover:text-zinc-400 ml-1 cursor-pointer"
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
                      ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                  }`}
                >
                  🖼 NFT Drop
                </button>
                <button
                  onClick={() => setDropType("token")}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    dropType === "token"
                      ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                  }`}
                >
                  🪙 Token Drop
                </button>
              </div>

              {/* Core fields */}
              <div className="space-y-3">
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
                  <span className="text-[10px] text-zinc-600 mt-0.5 block">
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
                {dropType === "token" && (
                  <div>
                    <label className={lbl}>Token divisibility</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsNonDivisible(false)}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                          !isNonDivisible
                            ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                        }`}
                      >
                        Divisible (18 decimals)
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsNonDivisible(true)}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                          isNonDivisible
                            ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                        }`}
                      >
                        Non-divisible (whole)
                      </button>
                    </div>
                  </div>
                )}

                {/* LSP4 Metadata */}
                <div className="border-t border-zinc-700/30 pt-4 mt-1">
                  <p className="text-xs font-semibold text-zinc-300 mb-3">Metadata</p>

                  {/* Icon upload */}
                  <div className="mb-3">
                    <label className={lbl}>Icon *</label>
                    <div className="flex items-center gap-3">
                      {iconPreview ? (
                        <img
                          src={iconPreview}
                          alt="Icon preview"
                          className="w-10 h-10 rounded-lg object-cover border border-zinc-700"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-600 text-sm">
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
                          className="text-xs text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
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
                      <p className="text-[10px] text-zinc-600 mt-1">{iconFile.name}</p>
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
                        <div key={i} className="bg-zinc-800/40 rounded-lg p-2.5 space-y-1.5">
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
                              className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors cursor-pointer"
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
                    <span className="text-[10px] text-zinc-600 block mb-1.5">
                      Attach files to the token (images, documents, media). Uploaded to IPFS.
                    </span>
                    {assetFiles.length > 0 && (
                      <div className="space-y-1.5 mb-2">
                        {assetFiles.map((file, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between bg-zinc-800/40 rounded-lg px-3 py-2"
                          >
                            <span className="text-xs text-zinc-300 truncate flex-1 mr-2">
                              {file.name}
                            </span>
                            <span className="text-[10px] text-zinc-600 mr-2 flex-shrink-0">
                              {(file.size / 1024).toFixed(0)} KB
                            </span>
                            <button
                              type="button"
                              onClick={() => removeAsset(i)}
                              className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors cursor-pointer flex-shrink-0"
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

                  <p className="text-[10px] text-zinc-600">
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
            </>
          )}
        </div>

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

        <Footer />
      </div>
    </div>
  );
}
