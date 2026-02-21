import { BrowserProvider, Contract } from "ethers";

// --- Config ---
// Set these in .env or replace directly
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";
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
  "event NFTClaimed(address indexed claimer, bytes32 tokenId)",
];

let provider: BrowserProvider | null = null;
let contract: Contract | null = null;
let userAddress: string | null = null;

// --- DOM ---
const connectBtn = document.getElementById("connectBtn") as HTMLButtonElement;
const claimBtn = document.getElementById("claimBtn") as HTMLButtonElement;
const statusDiv = document.getElementById("status") as HTMLDivElement;
const dropName = document.getElementById("dropName") as HTMLElement;
const totalClaimedEl = document.getElementById("totalClaimed") as HTMLElement;
const maxSupplyEl = document.getElementById("maxSupply") as HTMLElement;
const inactiveBanner = document.getElementById("inactiveBanner") as HTMLElement;

function setStatus(msg: string, type: "success" | "error" | "loading") {
  statusDiv.textContent = msg;
  statusDiv.className = `status ${type}`;
}

function clearStatus() {
  statusDiv.className = "status";
  statusDiv.textContent = "";
}

// --- Wallet ---
async function ensureLuksoNetwork() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: LUKSO_CHAIN_ID }],
    });
  } catch (e: any) {
    if (e.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: LUKSO_CHAIN_ID,
            chainName: "LUKSO",
            nativeCurrency: { name: "LYX", symbol: "LYX", decimals: 18 },
            rpcUrls: ["https://rpc.mainnet.lukso.network"],
            blockExplorerUrls: ["https://explorer.execution.mainnet.lukso.network"],
          },
        ],
      });
    }
  }
}

(window as any).connectWallet = async function () {
  if (!window.ethereum) {
    setStatus("Install the UP Browser Extension to continue", "error");
    return;
  }

  try {
    setStatus("Connecting...", "loading");
    await ensureLuksoNetwork();

    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    userAddress = accounts[0];
    provider = new BrowserProvider(window.ethereum);
    contract = new Contract(CONTRACT_ADDRESS, ABI, await provider.getSigner());

    connectBtn.style.display = "none";
    clearStatus();
    await refreshState();
  } catch (e: any) {
    setStatus(e.message || "Failed to connect", "error");
  }
};

// --- State ---
async function refreshState() {
  if (!contract || !userAddress) return;

  try {
    const [name, claimed, supply, active, alreadyClaimed] = await Promise.all([
      contract.name(),
      contract.totalClaimed(),
      contract.maxSupply(),
      contract.isClaimActive(),
      contract.hasClaimed(userAddress),
    ]);

    dropName.textContent = name;
    totalClaimedEl.textContent = claimed.toString();
    maxSupplyEl.textContent = supply === 0n ? "∞" : supply.toString();

    if (!active) {
      inactiveBanner.style.display = "block";
      claimBtn.style.display = "none";
    } else if (alreadyClaimed) {
      claimBtn.style.display = "block";
      claimBtn.disabled = true;
      claimBtn.textContent = "Already Claimed ✓";
    } else {
      inactiveBanner.style.display = "none";
      claimBtn.style.display = "block";
      claimBtn.disabled = false;
      claimBtn.textContent = "Claim NFT";
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }
}

// --- Claim ---
(window as any).claimNFT = async function () {
  if (!contract) return;

  try {
    claimBtn.disabled = true;
    setStatus("Confirming transaction...", "loading");

    const tx = await contract.claim();
    setStatus("Transaction sent! Waiting for confirmation...", "loading");

    const receipt = await tx.wait();
    setStatus("🎉 NFT Claimed! Check your Universal Profile", "success");

    claimBtn.textContent = "Already Claimed ✓";
    await refreshState();
  } catch (e: any) {
    const msg =
      e.reason || e.message?.slice(0, 100) || "Transaction failed";
    setStatus(msg, "error");
    claimBtn.disabled = false;
  }
};

// --- Init ---
if (CONTRACT_ADDRESS) {
  // Load read-only state even without wallet
  import("ethers").then(async ({ JsonRpcProvider, Contract: C }) => {
    const rpc = new JsonRpcProvider("https://rpc.mainnet.lukso.network");
    const readOnly = new C(CONTRACT_ADDRESS, ABI, rpc);
    try {
      const [name, claimed, supply, active] = await Promise.all([
        readOnly.name(),
        readOnly.totalClaimed(),
        readOnly.maxSupply(),
        readOnly.isClaimActive(),
      ]);
      dropName.textContent = name;
      totalClaimedEl.textContent = claimed.toString();
      maxSupplyEl.textContent = supply === 0n ? "∞" : supply.toString();
      if (!active) inactiveBanner.style.display = "block";
    } catch (e) {
      console.error("Failed to load contract:", e);
    }
  });
} else {
  dropName.textContent = "Token Claimer";
  (document.getElementById("dropDescription") as HTMLElement).textContent =
    "Set VITE_CONTRACT_ADDRESS in .env";
}

// TypeScript: window.ethereum
declare global {
  interface Window {
    ethereum: any;
  }
}
