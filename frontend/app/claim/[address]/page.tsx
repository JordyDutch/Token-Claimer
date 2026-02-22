"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits } from "ethers";
import { CLAIM_ABI, LSP7_EXTRA_ABI, LSP8_EXTRA_ABI, LUKSO_RPC, ZERO, getProvider, ensureLuksoNetwork, detectTokenType } from "../../lib/contracts";
import { fetchProfile, ProfileInfo } from "../../lib/profile";
import Link from "next/link";

type Status = { message: string; type: "success" | "error" | "loading" } | null;

export default function ClaimPage() {
  const params = useParams();
  const contractAddress = params.address as string;

  const [address, setAddress] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<ProfileInfo | null>(null);
  const [dropName, setDropName] = useState("Loading...");
  const [tokenType, setTokenType] = useState<"LSP7" | "LSP8" | null>(null);
  const [claimedDisplay, setClaimedDisplay] = useState("-");
  const [supplyDisplay, setSupplyDisplay] = useState("-");
  const [amountDisplay, setAmountDisplay] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [claiming, setClaiming] = useState(false);
  const [reqInfo, setReqInfo] = useState<{ token: string; tokenAmount: bigint; tokenName: string; followers: bigint } | null>(null);
  const [eligibility, setEligibility] = useState<{ tokenOk: boolean; followersOk: boolean } | null>(null);
  const [owner, setOwner] = useState<string | null>(null);

  const loadState = useCallback(async (userAddr?: string) => {
    if (!contractAddress) return;
    const rpc = new JsonRpcProvider(LUKSO_RPC);
    const abi = [...CLAIM_ABI, ...LSP7_EXTRA_ABI, ...LSP8_EXTRA_ABI];
    const c = new Contract(contractAddress, abi, rpc);

    try {
      const type = await detectTokenType(c);
      setTokenType(type);

      const [name, supply, active, amount, rToken, rAmount, rFollowers, ownerAddr] = await Promise.all([
        c.name(), c.maxSupply(), c.isClaimActive(), c.amountPerClaim(),
        c.requiredToken(), c.requiredTokenAmount(), c.requiredFollowers(), c.owner(),
      ]);
      setDropName(name); setIsActive(active); setOwner(ownerAddr);
      fetchProfile(ownerAddr).then(setCreatorProfile).catch(() => {});

      let tokenName = "";
      if (rToken !== ZERO && rAmount > BigInt(0)) {
        try { const tc = new Contract(rToken, ["function name() view returns (string)"], rpc); tokenName = await tc.name(); }
        catch { tokenName = `${rToken.slice(0, 6)}...${rToken.slice(-4)}`; }
      }
      const hasReqs = (rToken !== ZERO && rAmount > BigInt(0)) || rFollowers > BigInt(0);
      setReqInfo(hasReqs ? { token: rToken, tokenAmount: rAmount, tokenName, followers: rFollowers } : null);

      if (type === "LSP7") {
        const [totalAmount, claimers, decimals] = await Promise.all([c.totalClaimedAmount(), c.totalClaimers(), c.decimals()]);
        const dec = Number(decimals);
        setClaimedDisplay(claimers.toString());
        setSupplyDisplay(supply === BigInt(0) ? "∞" : formatUnits(supply, dec));
        setAmountDisplay(formatUnits(amount, dec) + " tokens");
      } else {
        const totalClaimed = await c.totalClaimed();
        setClaimedDisplay(totalClaimed.toString());
        setSupplyDisplay(supply === BigInt(0) ? "∞" : supply.toString());
        setAmountDisplay(amount.toString() + (amount === BigInt(1) ? " NFT" : " NFTs"));
      }

      if (userAddr) {
        const [claimed, meets] = await Promise.all([
          c.hasClaimed(userAddr),
          hasReqs ? c.meetsRequirements(userAddr) : Promise.resolve({ tokenOk: true, followersOk: true }),
        ]);
        setAlreadyClaimed(claimed);
        setEligibility({ tokenOk: meets.tokenOk, followersOk: meets.followersOk });
      }
    } catch (e) { console.error("Load error:", e); setDropName("Unknown Drop"); }
  }, [contractAddress]);

  useEffect(() => { loadState(); }, [loadState]);

  async function connect() {
    const p = getProvider();
    if (!p) { setStatus({ message: "Install the UP Browser Extension", type: "error" }); return; }
    try {
      setStatus({ message: "Connecting...", type: "loading" });
      await ensureLuksoNetwork();
      const accounts = await p.request({ method: "eth_requestAccounts" });
      setAddress(accounts[0]); setStatus(null);
      await loadState(accounts[0]);
      fetchProfile(accounts[0]).then(setProfile);
    } catch (e: any) { setStatus({ message: e.message || "Failed", type: "error" }); }
  }

  async function claim() {
    const p = getProvider();
    if (!p || !address) return;
    try {
      setClaiming(true);
      setStatus({ message: "Confirm in your wallet...", type: "loading" });
      const provider = new BrowserProvider(p);
      const signer = await provider.getSigner();
      const c = new Contract(contractAddress, CLAIM_ABI, signer);
      const tx = await c.claim();
      setStatus({ message: "Waiting for confirmation...", type: "loading" });
      await tx.wait();
      setStatus({ message: tokenType === "LSP7" ? "🎉 Tokens claimed!" : "🎉 NFT claimed!", type: "success" });
      setAlreadyClaimed(true);
      await loadState(address);
    } catch (e: any) {
      setStatus({ message: e.reason || e.message?.slice(0, 100) || "Failed", type: "error" });
    } finally { setClaiming(false); }
  }

  const canClaim = isActive && !alreadyClaimed && !claiming && (!eligibility || (eligibility.tokenOk && eligibility.followersOk));

  return (
    <div className="min-h-dvh flex items-center justify-center px-3 py-6 sm:p-4">
      <div className="max-w-md w-full">
        <div className="bg-[#12121a] rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-center border border-purple-500/10">
          <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-xl sm:rounded-2xl mx-auto mb-4 sm:mb-6 bg-gradient-to-br from-violet-600 to-purple-400 flex items-center justify-center text-4xl sm:text-6xl">
            {tokenType === "LSP7" ? "🪙" : "🎵"}
          </div>

          <h1 className="text-xl sm:text-2xl font-bold mb-1">{dropName}</h1>

          {/* Creator */}
          {creatorProfile && (
            <div className="flex items-center justify-center gap-1.5 mb-2">
              <span className="text-zinc-500 text-xs">by</span>
              {creatorProfile.image && <img src={creatorProfile.image} alt="" className="w-4 h-4 rounded-full object-cover" />}
              <span className="text-zinc-400 text-xs">{creatorProfile.name || (owner ? `${owner.slice(0, 6)}...${owner.slice(-4)}` : "")}</span>
            </div>
          )}

          {address ? (
            <div className="flex items-center justify-center gap-2 mb-2">
              {profile?.image && <img src={profile.image} alt="" className="w-6 h-6 rounded-full object-cover" />}
              <span className="text-zinc-300 text-xs sm:text-sm font-medium">{profile?.name || `${address.slice(0, 6)}...${address.slice(-4)}`}</span>
              <button onClick={() => { setAddress(null); setProfile(null); setAlreadyClaimed(false); setEligibility(null); }} className="text-zinc-600 hover:text-zinc-400 text-[10px] ml-1">Disconnect</button>
            </div>
          ) : (
            <p className="text-zinc-500 mb-2 text-xs sm:text-sm">Connect your Universal Profile to claim</p>
          )}

          {amountDisplay && (
            <div className="inline-block bg-purple-500/10 border border-purple-500/20 text-purple-400 px-3 py-1 rounded-full text-xs font-medium mb-4">
              {amountDisplay} per claim
            </div>
          )}

          {/* Requirements */}
          {reqInfo && (
            <div className="bg-zinc-800/50 rounded-xl p-3 sm:p-4 mb-4 text-left text-xs sm:text-sm">
              <div className="text-zinc-400 text-[10px] uppercase tracking-wider mb-2 text-center font-medium">Requirements</div>
              {reqInfo.token !== ZERO && reqInfo.tokenAmount > BigInt(0) && (
                <div className="flex items-center justify-between py-1">
                  <span className="text-zinc-300">Hold {reqInfo.tokenAmount.toString()} {reqInfo.tokenName}</span>
                  {eligibility && <span className={eligibility.tokenOk ? "text-green-400" : "text-red-400"}>{eligibility.tokenOk ? "✓" : "✗"}</span>}
                </div>
              )}
              {reqInfo.followers > BigInt(0) && (
                <div className="flex items-center justify-between py-1">
                  <span className="text-zinc-300">{reqInfo.followers.toString()}+ followers</span>
                  {eligibility && <span className={eligibility.followersOk ? "text-green-400" : "text-red-400"}>{eligibility.followersOk ? "✓" : "✗"}</span>}
                </div>
              )}
            </div>
          )}

          {!isActive && tokenType && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2.5 rounded-xl mb-4 text-xs sm:text-sm">
              Claim is not active right now
            </div>
          )}

          <div className="flex justify-center gap-8 sm:gap-12 mb-6 sm:mb-8">
            <div><div className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider">Claimers</div><div className="text-lg sm:text-xl font-semibold text-purple-400">{claimedDisplay}</div></div>
            <div><div className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider">Max Supply</div><div className="text-lg sm:text-xl font-semibold text-purple-400">{supplyDisplay}</div></div>
          </div>

          {!address ? (
            <button onClick={connect} className="w-full py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-base sm:text-lg font-semibold border-2 border-purple-400 text-purple-400 hover:bg-purple-400/10 transition-all cursor-pointer active:scale-[0.97]">
              Connect Universal Profile
            </button>
          ) : alreadyClaimed ? (
            <button disabled className="w-full py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-base sm:text-lg font-semibold bg-purple-400/50 text-white cursor-not-allowed">Already Claimed ✓</button>
          ) : (
            <button onClick={claim} disabled={!canClaim} className="w-full py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-base sm:text-lg font-semibold bg-purple-400 text-white hover:bg-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.97]">
              {claiming ? "Claiming..." : !eligibility || (eligibility.tokenOk && eligibility.followersOk) ? (tokenType === "LSP7" ? "Claim Tokens" : "Claim NFT") : "Requirements not met"}
            </button>
          )}

          {status && (
            <div className={`mt-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm ${status.type === "success" ? "bg-green-500/10 border border-green-500/20 text-green-400" : status.type === "error" ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-purple-500/10 border border-purple-500/20 text-purple-400"}`}>
              {status.message}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center mt-4 sm:mt-6 px-2">
          <Link href="/" className="text-zinc-600 text-[10px] sm:text-xs hover:text-purple-400">← All drops</Link>
          {address && owner && address.toLowerCase() === owner.toLowerCase() && (
            <Link href={`/manage/${contractAddress}`} className="text-zinc-600 text-[10px] sm:text-xs hover:text-purple-400">Manage →</Link>
          )}
          <p className="text-zinc-600 text-[10px] sm:text-xs">Powered by <a href="https://lukso.network" target="_blank" className="text-purple-400 hover:underline">LUKSO</a></p>
        </div>
      </div>
    </div>
  );
}
