"use client";

import { useState, useEffect, useRef, use } from "react";
import { BrowserProvider } from "ethers";
import Link from "next/link";
import CopyButton from "../../../components/CopyButton";
import Footer from "../../../components/Footer";
import { useWallet } from "../../../components/WalletProvider";
import { useNetwork } from "../../../components/NetworkProvider";
import { useUPProvider } from "../../../components/UPProviderInit";
import { getProvider } from "../../../lib/contracts";
import { PublicDropInfo } from "../../../lib/secret-drop";
import TokenSearchInput from "../../../components/TokenSearchInput";
import UPSearchInput from "../../../components/UPSearchInput";

const IPFS_GATEWAY = "https://api.universalprofile.cloud/ipfs";

type Status = { message: string; type: "success" | "error" | "loading" } | null;

export default function SecretDropManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { address, connect: walletConnect } = useWallet();
  const { config: networkConfig } = useNetwork();
  const { inIframe } = useUPProvider();

  const [drop, setDrop] = useState<PublicDropInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [notOwner, setNotOwner] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [active, setActive] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageCid, setImageCid] = useState<string | null>(null);
  const [tokenReqs, setTokenReqs] = useState<Array<{ address: string; minBalance: string }>>([]);
  const [minFollowers, setMinFollowers] = useState("0");
  const [followAddress, setFollowAddress] = useState("");
  const imageRef = useRef<HTMLInputElement>(null);

  // Load drop config
  useEffect(() => {
    setLoading(true);
    fetch(`/api/secret-drop/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data: PublicDropInfo | null) => {
        if (!data) return;
        setDrop(data);
        setActive(data.active);
        setIsPublic((data as any).isPublic ?? false);
        setImageCid((data as any).image ?? null);
        if ((data as any).image) {
          setImagePreview(`${IPFS_GATEWAY}/${(data as any).image}`);
        }
        setTokenReqs(
          (data.tokenRequirements ?? []).map((t) => ({
            address: t.address,
            minBalance: t.minBalance === "0" ? "0" : (Number(BigInt(t.minBalance)) / 1e18).toString(),
          }))
        );
        setMinFollowers(String(data.minFollowers ?? 0));
        setFollowAddress(data.followerRequirement?.followAddress ?? "");
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  // Check ownership when wallet connects
  useEffect(() => {
    if (!drop || !address) { setNotOwner(false); return; }
    setNotOwner(drop.creator.toLowerCase() !== address.toLowerCase());
  }, [drop, address]);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (file) {
      setImagePreview(URL.createObjectURL(file));
    }
  }

  async function signAndUpdate(updates: Record<string, any>) {
    const p = getProvider();
    if (!p || !address) return;
    try {
      setSaving(true);
      setStatus({ message: "Sign in your wallet...", type: "loading" });
      const provider = new BrowserProvider(p);
      const signer = await provider.getSigner();
      const ts = Math.floor(Date.now() / 1000);
      const message = `Manage secret drop ${id} as ${address} at ${ts}`;
      const signature = await signer.signMessage(message);

      setStatus({ message: "Saving changes...", type: "loading" });
      const res = await fetch(`/api/secret-drop/${id}/manage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature, updates }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ message: data.error ?? "Failed", type: "error" });
        return;
      }
      setStatus({ message: "Saved!", type: "success" });
      setTimeout(() => setStatus(null), 2000);
    } catch (e: any) {
      if (e?.code === 4001 || e?.code === "ACTION_REJECTED") {
        setStatus({ message: "Signature rejected", type: "error" });
      } else {
        setStatus({ message: e?.message ?? "Something went wrong", type: "error" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    const newActive = !active;
    setActive(newActive);
    await signAndUpdate({ active: newActive });
  }

  async function handleTogglePublic() {
    const newPublic = !isPublic;
    setIsPublic(newPublic);
    await signAndUpdate({ isPublic: newPublic });
  }

  async function handleImageUpload() {
    if (!imageFile) return;
    try {
      setSaving(true);
      setStatus({ message: "Uploading image to IPFS...", type: "loading" });
      const form = new FormData();
      form.append("file", imageFile, imageFile.name);
      const uploadRes = await fetch("/api/ipfs", { method: "POST", body: form });
      if (!uploadRes.ok) { setStatus({ message: "Image upload failed", type: "error" }); return; }
      const { IpfsHash } = await uploadRes.json();
      setImageCid(IpfsHash);
      setImagePreview(`${IPFS_GATEWAY}/${IpfsHash}`);
      setImageFile(null);
      if (imageRef.current) imageRef.current.value = "";
      await signAndUpdate({ image: IpfsHash });
    } catch (e: any) {
      setStatus({ message: e?.message ?? "Upload failed", type: "error" });
      setSaving(false);
    }
  }

  async function handleRemoveImage() {
    setImageCid(null);
    setImagePreview(null);
    setImageFile(null);
    if (imageRef.current) imageRef.current.value = "";
    await signAndUpdate({ image: null });
  }

  async function handleSaveRequirements() {
    const tokenRequirements = tokenReqs
      .filter((r) => r.address.startsWith("0x") && r.address.length === 42)
      .map((r) => ({
        address: r.address,
        minBalance: r.minBalance && Number(r.minBalance) > 0
          ? (BigInt(Math.round(Number(r.minBalance) * 1e18))).toString()
          : "0",
      }));
    const followerRequirement = followAddress.startsWith("0x") && followAddress.length === 42
      ? { followAddress }
      : null;
    await signAndUpdate({
      tokenRequirements,
      followerRequirement,
      minFollowers: Number(minFollowers) || 0,
    });
  }

  const inp = "w-full bg-surface border border-border-default rounded-lg px-3 py-2.5 text-sm text-secondary focus:outline-none focus:border-purple-400 transition-colors";
  const lbl = "text-[11px] sm:text-xs text-label mb-1 block";
  const card = "bg-card rounded-xl p-5 sm:p-8 border border-border-muted card-elevated";

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

  if (!address) {
    return (
      <div className={inIframe ? "px-4 py-4" : "min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4"}>
        <div className={card + " max-w-lg w-full text-center"}>
          <div className="text-4xl mb-3">🔗</div>
          <p className="text-muted text-sm mb-4">Connect your Universal Profile to manage this drop</p>
          <button
            onClick={() => walletConnect()}
            className="px-6 py-3 rounded-xl text-sm font-semibold border-2 border-purple-400 text-purple-400 hover:bg-purple-400/10 transition-all cursor-pointer active:scale-[0.97]"
          >
            Connect Universal Profile
          </button>
        </div>
      </div>
    );
  }

  if (notOwner) {
    return (
      <div className={inIframe ? "px-4 py-4" : "min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4"}>
        <div className={card + " max-w-lg w-full text-center"}>
          <div className="text-4xl mb-3">🚫</div>
          <p className="text-muted text-sm mb-2">You are not the creator of this drop</p>
          <Link href="/" className="text-purple-400 text-xs hover:underline">Back home</Link>
        </div>
      </div>
    );
  }

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/secret-drop/${id}` : `/secret-drop/${id}`;

  return (
    <div className={inIframe ? "px-4 py-4" : "min-h-dvh px-3 py-6 sm:p-8"}>
      <div className={inIframe ? "w-full max-w-2xl mx-auto space-y-4" : "max-w-2xl mx-auto space-y-4"}>
        {/* Header */}
        <div className={card}>
          <Link href="/my-drops" className="text-label text-xs hover:text-purple-400 transition-colors">
            ← Back to My Drops
          </Link>

          <div className="flex items-start gap-4 mt-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden">
              {imagePreview ? (
                <img src={imagePreview} alt="" className="w-full h-full object-cover" />
              ) : (
                "🔒"
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold truncate">{drop.title}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30">
                  Secret
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-label">
                  {drop.mode === "pool" ? "Pool" : "Shared"} mode
                </span>
                <span className="text-[10px] text-faint">
                  {drop.totalCodes} codes · Created {new Date(drop.createdAt * 1000).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Claim link */}
          <div className="bg-surface-subtle rounded-xl p-3 mt-4">
            <p className="text-[10px] text-label mb-1">Claim Link</p>
            <p className="text-xs font-mono text-violet-400 break-all mb-2">{shareUrl}</p>
            <CopyButton text={shareUrl} label="Copy link" />
          </div>
        </div>

        {/* Status toggle */}
        <div className={card}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Status</h2>
              <p className="text-xs text-label mt-0.5">
                {active ? "Drop is live — claimers can receive codes" : "Drop is paused — no one can claim"}
              </p>
            </div>
            <button
              onClick={handleToggleActive}
              disabled={saving}
              className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                active ? "bg-green-500" : "bg-surface-hover"
              }`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                active ? "translate-x-6" : "translate-x-0.5"
              }`} />
            </button>
          </div>
        </div>

        {/* Visibility toggle */}
        <div className={card}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Visibility</h2>
              <p className="text-xs text-label mt-0.5">
                {isPublic ? "Visible on the Explore page" : "Only accessible via direct link"}
              </p>
            </div>
            <button
              onClick={handleTogglePublic}
              disabled={saving}
              className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                isPublic ? "bg-violet-500" : "bg-surface-hover"
              }`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                isPublic ? "translate-x-6" : "translate-x-0.5"
              }`} />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className={card}>
          <h2 className="text-sm font-semibold mb-3">Drop Image</h2>
          <div className="flex items-center gap-3">
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Drop image"
                className="w-14 h-14 rounded-xl object-cover border border-border-default"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-surface border border-border-default flex items-center justify-center text-faint text-lg">
                🔒
              </div>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => imageRef.current?.click()}
                className="text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
              >
                {imageCid ? "Change image" : "Upload image"}
              </button>
              {imageCid && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  disabled={saving}
                  className="text-xs text-label hover:text-red-400 transition-colors cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <input
            ref={imageRef}
            type="file"
            accept="image/jpeg,image/png,image/svg+xml,image/webp"
            onChange={handleImageChange}
            className="hidden"
          />
          {imageFile && (
            <div className="mt-3">
              <p className="text-[10px] text-faint mb-2">{imageFile.name}</p>
              <button
                onClick={handleImageUpload}
                disabled={saving}
                className="text-xs font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg px-4 py-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Uploading..." : "Upload & Save"}
              </button>
            </div>
          )}
        </div>

        {/* Stats */}
        {drop.mode === "pool" && drop.remaining !== null && (
          <div className={card}>
            <h2 className="text-sm font-semibold mb-2">Stats</h2>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-label text-xs">Remaining</span>
                <p className="font-semibold">{drop.remaining} / {drop.totalCodes}</p>
              </div>
              <div>
                <span className="text-label text-xs">Claimed</span>
                <p className="font-semibold">{drop.totalCodes - drop.remaining}</p>
              </div>
            </div>
          </div>
        )}

        {/* Requirements */}
        <div className={card}>
          <h2 className="text-sm font-semibold mb-3">Requirements</h2>

          {/* Token requirements */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className={lbl + " mb-0"}>Token Requirements</label>
              <button
                type="button"
                onClick={() => setTokenReqs((prev) => [...prev, { address: "", minBalance: "1" }])}
                className="text-[10px] text-purple-400 hover:text-purple-300 border border-purple-500/20 rounded-md px-2 py-1 cursor-pointer"
              >
                + Add token
              </button>
            </div>
            {tokenReqs.length === 0 && (
              <p className="text-[11px] text-faint mb-1">No token requirement — anyone with a UP can claim</p>
            )}
            {tokenReqs.map((req, i) => (
              <div key={i} className="mb-3 bg-surface-subtle border border-border-muted rounded-xl p-3 space-y-2">
                <div>
                  <label className={lbl}>Token</label>
                  <TokenSearchInput
                    value={req.address}
                    onChange={(addr) => setTokenReqs((prev) => prev.map((r, j) => j === i ? { ...r, address: addr } : r))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className={lbl}>Min amount to hold <span className="text-faint">(0 = just hold any)</span></label>
                    <input
                      type="number" min="0" placeholder="0"
                      value={req.minBalance}
                      onChange={(e) => setTokenReqs((prev) => prev.map((r, j) => j === i ? { ...r, minBalance: e.target.value } : r))}
                      className={inp}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setTokenReqs((prev) => prev.filter((_, j) => j !== i))}
                    className="mt-5 text-red-400 hover:text-red-300 text-xs border border-red-500/20 rounded-md px-2 py-1.5 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Follower requirements */}
          <div className="space-y-3 mb-4">
            <div>
              <label className={lbl}>Minimum followers <span className="text-faint">(0 = no requirement)</span></label>
              <input
                type="number" min="0" value={minFollowers}
                onChange={(e) => setMinFollowers(e.target.value)}
                className={inp}
              />
            </div>
            <div>
              <label className={lbl}>Must follow UP <span className="text-faint">(optional)</span></label>
              <UPSearchInput
                value={followAddress}
                onChange={setFollowAddress}
                placeholder="Search by name or paste 0x address..."
              />
            </div>
          </div>

          <button
            onClick={handleSaveRequirements}
            disabled={saving}
            className="w-full py-2.5 rounded-xl text-xs font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-all disabled:opacity-50 cursor-pointer active:scale-[0.97]"
          >
            {saving ? "Saving..." : "Save Requirements"}
          </button>
        </div>

        {/* Status message */}
        {status && (
          <div className={`px-3 py-2.5 rounded-xl text-xs sm:text-sm ${
            status.type === "success"
              ? "bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400"
              : status.type === "error"
              ? "bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400"
              : "bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-700 dark:text-purple-400"
          }`}>
            {status.message}
          </div>
        )}

        {!inIframe && <Footer />}
      </div>
    </div>
  );
}
