"use client";

import React from "react";
import Link from "next/link";
import Footer from "../components/Footer";
import { useUPProvider } from "../components/UPProviderInit";

const EXPLORER_MAINNET = "https://explorer.execution.mainnet.lukso.network";
const EXPLORER_TESTNET = "https://explorer.execution.testnet.lukso.network";

const contracts = {
  mainnet: {
    lsp7Factory: "0x9b132E764f92c6E6F5E91E276E310758C33dB08F",
    lsp8Factory: "0xBd545E98F133282bD79dc4a6ac422437478A58b6",
  },
  testnet: {
    lsp7Factory: "0x58877A19286c054acBcE221c7E92ab9039Bf2909",
    lsp8Factory: "0x6625eDFaca73475dD44b4dAFC8666d92e4d3CAFf",
  },
  lsp26: "0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA",
};

function highlight(code: string): React.ReactNode[] {
  const rules: [RegExp, string][] = [
    [/\/\/[^\n]*/g, "text-faint italic"],
    [/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, "text-green-600 dark:text-green-400"],
    [/\b(?:address|uint256|uint8|bytes32|bytes|bool|string|memory|calldata|mapping|tuple)\b/g, "text-amber-600 dark:text-amber-400"],
    [/\b(?:function|returns?|view|external|public|struct|import|from|const|let|var|await|async|new|try|catch|if|else|for)\b/g, "text-pink-500 dark:text-pink-400 font-semibold"],
    [/\b\d[\d_]*\b/g, "text-blue-600 dark:text-blue-400"],
  ];

  // Process sequentially: each rule only matches plain (un-highlighted) text
  type Seg = string | { key: number; cls: string; text: string };
  let segments: Seg[] = [code];
  let keyCounter = 0;

  for (const [re, cls] of rules) {
    const next: Seg[] = [];
    for (const seg of segments) {
      if (typeof seg !== "string") { next.push(seg); continue; }
      const regex = new RegExp(re.source, re.flags);
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(seg)) !== null) {
        if (m.index > last) next.push(seg.slice(last, m.index));
        next.push({ key: keyCounter++, cls, text: m[0] });
        last = m.index + m[0].length;
      }
      if (last < seg.length) next.push(seg.slice(last));
    }
    segments = next;
  }

  return segments.map((seg) =>
    typeof seg === "string" ? seg : <span key={seg.key} className={seg.cls}>{seg.text}</span>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-surface rounded-lg p-4 text-[11px] sm:text-xs font-mono overflow-x-auto text-secondary border border-border-muted">
      <code>{highlight(children)}</code>
    </pre>
  );
}

function Addr({ address, explorer }: { address: string; explorer: string }) {
  return (
    <a
      href={`${explorer}/address/${address}#code`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-[11px] sm:text-xs text-pink-500 dark:text-pink-400 hover:underline break-all"
    >
      {address}
    </a>
  );
}

export default function DevelopersPage() {
  const { inIframe } = useUPProvider();

  const card = "bg-card rounded-xl p-5 sm:p-8 border border-border-muted card-elevated";
  const sectionTitle = "text-lg sm:text-xl font-bold mb-3";
  const sub = "text-xs sm:text-sm text-muted mb-4";

  return (
    <div className={inIframe ? "px-4 py-4" : "min-h-dvh px-3 py-6 sm:p-8"}>
      <div className={inIframe ? "w-full relative" : "max-w-4xl mx-auto"}>
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

        {/* Hero */}
        <div className="mb-8 sm:mb-10">
          <Link href="/" className="text-label text-xs hover:text-pink-500 transition-colors">
            ← Back
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold mt-3 mb-2">Developers</h1>
          <p className="text-muted text-sm sm:text-base max-w-2xl">
            Token Claimer is an open-source protocol on LUKSO that lets anyone deploy token and NFT
            drop campaigns. All contracts are verified on-chain.
          </p>
        </div>

        <div className="space-y-4 sm:space-y-6">

          {/* Architecture */}
          <div className={card}>
            <h2 className={sectionTitle}>Architecture</h2>
            <p className={sub}>
              The system uses a factory pattern. Two factory contracts (one for LSP7 tokens, one for
              LSP8 NFTs) deploy individual drop contracts. Each drop is its own contract owned by the
              creator.
            </p>
            <div className="bg-surface-subtle rounded-xl p-4 sm:p-6 border border-border-muted text-xs sm:text-sm font-mono text-center space-y-3">
              <div className="flex items-center justify-center gap-2 sm:gap-4 flex-wrap">
                <span className="bg-pink-500 dark:bg-pink-500/10 border border-pink-500 dark:border-pink-500/20 text-pink-500 dark:text-pink-400 px-3 py-1.5 rounded-lg font-semibold">
                  LSP7DropFactory
                </span>
                <span className="text-faint hidden sm:inline">/</span>
                <span className="bg-pink-500 dark:bg-pink-500/10 border border-pink-500 dark:border-pink-500/20 text-pink-500 dark:text-pink-400 px-3 py-1.5 rounded-lg font-semibold">
                  LSP8DropFactory
                </span>
              </div>
              <div className="text-label">↓ deploys</div>
              <div className="flex items-center justify-center gap-2 sm:gap-4 flex-wrap">
                <span className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-lg">
                  LSP7ClaimableToken
                </span>
                <span className="text-faint hidden sm:inline">/</span>
                <span className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-lg">
                  LSP8ClaimableNFT
                </span>
              </div>
              <div className="text-label">↓ claimer calls claim()</div>
              <span className="inline-block bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-lg">
                Tokens / NFTs minted to claimer
              </span>
            </div>
          </div>

          {/* Verified Contracts */}
          <div className={card}>
            <h2 className={sectionTitle}>Verified Contracts</h2>
            <p className={sub}>
              All contracts are verified and readable on the LUKSO block explorer.
            </p>

            {/* Mainnet */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-semibold">Mainnet</span>
                <span className="text-[10px] text-label">(Chain ID: 42)</span>
              </div>
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="text-xs text-label w-32 flex-shrink-0">LSP7DropFactory</span>
                  <Addr address={contracts.mainnet.lsp7Factory} explorer={EXPLORER_MAINNET} />
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-500/20 flex-shrink-0 w-fit">
                    Verified
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="text-xs text-label w-32 flex-shrink-0">LSP8DropFactory</span>
                  <Addr address={contracts.mainnet.lsp8Factory} explorer={EXPLORER_MAINNET} />
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-500/20 flex-shrink-0 w-fit">
                    Verified
                  </span>
                </div>
              </div>
            </div>

            {/* Testnet */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-sm font-semibold">Testnet</span>
                <span className="text-[10px] text-label">(Chain ID: 4201)</span>
              </div>
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="text-xs text-label w-32 flex-shrink-0">LSP7DropFactory</span>
                  <Addr address={contracts.testnet.lsp7Factory} explorer={EXPLORER_TESTNET} />
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-500/20 flex-shrink-0 w-fit">
                    Verified
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="text-xs text-label w-32 flex-shrink-0">LSP8DropFactory</span>
                  <Addr address={contracts.testnet.lsp8Factory} explorer={EXPLORER_TESTNET} />
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-500/20 flex-shrink-0 w-fit">
                    Verified
                  </span>
                </div>
              </div>
            </div>

            {/* LSP26 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold">LSP26 Follower Registry</span>
                <span className="text-[10px] text-label">(same on both networks)</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                <Addr address={contracts.lsp26} explorer={EXPLORER_MAINNET} />
              </div>
            </div>
          </div>

          {/* How It Works */}
          <div className={card}>
            <h2 className={sectionTitle}>How It Works</h2>
            <div className="space-y-4">
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-pink-500 dark:bg-pink-500/10 border border-pink-500 dark:border-pink-500/20 text-pink-500 dark:text-pink-400 text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                <div>
                  <p className="text-sm font-medium mb-1">Creator deploys a drop</p>
                  <p className="text-xs text-label">
                    Calls <code className="text-pink-500 dark:text-pink-400">createTokenDrop()</code> or <code className="text-pink-500 dark:text-pink-400">createNFTDrop()</code> on
                    the factory. This deploys a fresh contract and transfers ownership to the creator.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-pink-500 dark:bg-pink-500/10 border border-pink-500 dark:border-pink-500/20 text-pink-500 dark:text-pink-400 text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                <div>
                  <p className="text-sm font-medium mb-1">Creator configures the drop</p>
                  <p className="text-xs text-label">
                    Enable claiming, set a time window, add token-gating requirements (hold LSP7/LSP8 tokens),
                    require a minimum follower count or follow-address via LSP26, or set a lightweight codeword gate.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-pink-500 dark:bg-pink-500/10 border border-pink-500 dark:border-pink-500/20 text-pink-500 dark:text-pink-400 text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                <div>
                  <p className="text-sm font-medium mb-1">Users claim tokens or NFTs</p>
                  <p className="text-xs text-label">
                    Eligible users call <code className="text-pink-500 dark:text-pink-400">claim()</code> or <code className="text-pink-500 dark:text-pink-400">claimWithCode()</code>.
                    The contract validates all requirements, then mints tokens/NFTs directly to the claimer.
                    Each address can only claim once.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Contract Interface */}
          <div className={card}>
            <h2 className={sectionTitle}>Contract Interface</h2>

            <div className="space-y-5">
              {/* Factory */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Factory — Create Drops</h3>
                <CodeBlock>{`// LSP7 (Fungible Tokens)
function createTokenDrop(
  string name,
  string symbol,
  uint256 amountPerClaim,
  uint256 maxSupply,       // 0 = unlimited
  bool isNonDivisible      // true = 0 decimals, false = 18
) returns (address)

// LSP8 (NFTs)
function createNFTDrop(
  string name,
  string symbol,
  uint256 maxSupply,       // 0 = unlimited
  uint256 amountPerClaim   // max 50 per claim
) returns (address)`}</CodeBlock>
              </div>

              {/* Query */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Factory — Query Drops</h3>
                <CodeBlock>{`// LSP7
function totalCampaigns() view returns (uint256)
function getCampaigns(uint256 offset, uint256 limit)
  view returns (Campaign[] memory)

// LSP8
function totalNFTCampaigns() view returns (uint256)
function getNFTCampaigns(uint256 offset, uint256 limit)
  view returns (Campaign[] memory)

// Campaign struct
struct Campaign {
  address contractAddr;
  address creator;
  string name;
  string symbol;
  uint256 createdAt;
}`}</CodeBlock>
              </div>

              {/* Management */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Drop — Owner Management</h3>
                <CodeBlock>{`function setClaimEnabled(bool enabled)
function setClaimWindow(uint256 startTime, uint256 endTime)
function setAmountPerClaim(uint256 amount)
function setRequirements(
  address[] tokens,
  uint256[] minBalances,
  uint256 minFollowers,    // LSP26 follower count
  address followAddress    // UP the claimer must follow, or 0x0
)
function setCodeword(string word)  // hash stored; plaintext appears in claim calldata`}</CodeBlock>
              </div>

              {/* Claiming */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Drop — Claiming</h3>
                <CodeBlock>{`function claim()
function claimWithCode(string codeword)

// Codeword is a low-risk access phrase, not strong secrecy.
// The plaintext is revealed in claim transaction calldata.`}</CodeBlock>
              </div>

              {/* Views */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Drop — View Functions</h3>
                <CodeBlock>{`function claimEnabled() view returns (bool)
function isClaimActive() view returns (bool)
function hasClaimed(address) view returns (bool)
function meetsRequirements(address)
  view returns (bool tokenOk, bool followersOk, bool followOk)
function getTokenRequirements()
  view returns (address[] tokens, uint256[] minBalances)
function requiredFollowers() view returns (uint256)
function requiredFollowAddress() view returns (address)
function maxSupply() view returns (uint256)
function amountPerClaim() view returns (uint256)
function codewordEnabled() view returns (bool)
function owner() view returns (address)

// LSP7 only
function totalClaimers() view returns (uint256)
function totalClaimedAmount() view returns (uint256)
function decimals() view returns (uint8)

// LSP8 only
function totalClaimed() view returns (uint256)`}</CodeBlock>
              </div>

              {/* Errors */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Custom Errors</h3>
                <CodeBlock>{`ClaimNotActive()
AlreadyClaimed()
OutsideClaimWindow()
MaxSupplyReached()
InsufficientTokenBalance()
InsufficientFollowers()
NotFollowingRequired()
WrongCodeword()
ReentrancyGuard()`}</CodeBlock>
              </div>
            </div>
          </div>

          {/* LSP Standards */}
          <div className={card}>
            <h2 className={sectionTitle}>LSP Standards Used</h2>
            <div className="space-y-3">
              <div className="flex gap-3">
                <span className="bg-pink-500 dark:bg-pink-500/10 border border-pink-500 dark:border-pink-500/20 text-pink-500 dark:text-pink-400 text-[10px] font-bold px-2 py-1 rounded flex-shrink-0 h-fit">LSP7</span>
                <div>
                  <p className="text-sm font-medium">Digital Asset (Fungible Token)</p>
                  <p className="text-xs text-label">
                    LUKSO&apos;s standard for fungible tokens. Similar to ERC-20 but with <code className="text-pink-500 dark:text-pink-400">force</code> parameter
                    on transfers and metadata stored in ERC725Y (no <code className="text-pink-500 dark:text-pink-400">name()</code>/<code className="text-pink-500 dark:text-pink-400">symbol()</code> view functions).
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="bg-pink-500 dark:bg-pink-500/10 border border-pink-500 dark:border-pink-500/20 text-pink-500 dark:text-pink-400 text-[10px] font-bold px-2 py-1 rounded flex-shrink-0 h-fit">LSP8</span>
                <div>
                  <p className="text-sm font-medium">Identifiable Digital Asset (NFT)</p>
                  <p className="text-xs text-label">
                    LUKSO&apos;s NFT standard. Token IDs are <code className="text-pink-500 dark:text-pink-400">bytes32</code> (not uint256).
                    Drop contracts auto-increment IDs starting at 1.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="bg-pink-500 dark:bg-pink-500/10 border border-pink-500 dark:border-pink-500/20 text-pink-500 dark:text-pink-400 text-[10px] font-bold px-2 py-1 rounded flex-shrink-0 h-fit">LSP26</span>
                <div>
                  <p className="text-sm font-medium">Follower System</p>
                  <p className="text-xs text-label">
                    On-chain social graph. Drops can require claimers to have a minimum number of followers and/or follow a specific UP.
                    Registry is at <code className="text-pink-500 dark:text-pink-400 break-all">{contracts.lsp26}</code>.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="bg-pink-500 dark:bg-pink-500/10 border border-pink-500 dark:border-pink-500/20 text-pink-500 dark:text-pink-400 text-[10px] font-bold px-2 py-1 rounded flex-shrink-0 h-fit">LSP4</span>
                <div>
                  <p className="text-sm font-medium">Digital Asset Metadata</p>
                  <p className="text-xs text-label">
                    Token metadata (name, description, icon) stored on-chain as VerifiableURI pointing
                    to IPFS JSON. Creators can set this after deployment via the manage page.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Integration Examples */}
          <div className={card}>
            <h2 className={sectionTitle}>Integration Examples</h2>
            <p className={sub}>Using ethers.js v6 to interact with the contracts.</p>

            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold mb-2">Query all drops from a factory</h3>
                <CodeBlock>{`import { JsonRpcProvider, Contract } from "ethers";

const rpc = new JsonRpcProvider("https://rpc.mainnet.lukso.network");
const factory = new Contract(
  "${contracts.mainnet.lsp7Factory}",
  [
    "function totalCampaigns() view returns (uint256)",
    "function getCampaigns(uint256,uint256) view returns " +
      "(tuple(address contractAddr, address creator, " +
      "string name, string symbol, uint256 createdAt)[])",
  ],
  rpc
);

const total = await factory.totalCampaigns();
const campaigns = await factory.getCampaigns(0, total);

campaigns.forEach(c => {
  console.log(c.name, c.contractAddr);
});`}</CodeBlock>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Check eligibility for a user</h3>
                <CodeBlock>{`const drop = new Contract(dropAddress, [
  "function isClaimActive() view returns (bool)",
  "function hasClaimed(address) view returns (bool)",
  "function meetsRequirements(address) view returns " +
    "(bool tokenOk, bool followersOk, bool followOk)",
], rpc);

const active = await drop.isClaimActive();
const claimed = await drop.hasClaimed(userAddress);
const { tokenOk, followersOk, followOk } = await drop.meetsRequirements(
  userAddress
);

const canClaim = active && !claimed && tokenOk && followersOk && followOk;`}</CodeBlock>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Claim tokens via a Universal Profile</h3>
                <CodeBlock>{`import { BrowserProvider, Contract } from "ethers";

// Get the UP browser extension provider
const provider = new BrowserProvider(window.lukso);
const signer = await provider.getSigner();

const drop = new Contract(dropAddress, [
  "function claim() external",
  "function claimWithCode(string) external",
], signer);

// Simple claim
const tx = await drop.claim();
await tx.wait();

// Or claim with codeword
const tx2 = await drop.claimWithCode("secret");
await tx2.wait();`}</CodeBlock>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Detect token type (LSP7 vs LSP8)</h3>
                <CodeBlock>{`// LSP7 has decimals(), LSP8 does not
async function detectTokenType(contract) {
  try {
    await contract.decimals();
    return "LSP7"; // Fungible token
  } catch {
    return "LSP8"; // NFT
  }
}`}</CodeBlock>
              </div>
            </div>
          </div>

          {/* Links */}
          <div className={card}>
            <h2 className={sectionTitle}>Resources</h2>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://github.com/JordyDutch/Token-Claimer"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-lg text-xs font-medium bg-pink-500/15 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500 dark:border-pink-500/20 hover:bg-pink-500 dark:hover:bg-pink-500/20 transition-all"
              >
                GitHub Repository
              </a>
              <a
                href="https://github.com/JordyDutch/issue-tracker/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-lg text-xs font-medium bg-pink-500/15 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500 dark:border-pink-500/20 hover:bg-pink-500 dark:hover:bg-pink-500/20 transition-all"
              >
                Report Issues
              </a>
              <a
                href="https://docs.lukso.tech"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-lg text-xs font-medium text-muted border border-border-default hover:border-border-muted hover:text-tertiary transition-all"
              >
                LUKSO Docs
              </a>
              <a
                href="https://docs.lukso.tech/standards/introduction"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-lg text-xs font-medium text-muted border border-border-default hover:border-border-muted hover:text-tertiary transition-all"
              >
                LSP Standards
              </a>
            </div>
          </div>

        </div>

        {!inIframe && <Footer />}
      </div>
    </div>
  );
}
