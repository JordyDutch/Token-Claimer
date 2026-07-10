/**
 * Secret Drop — separate off-chain codes/links module with signed UP challenges
 * and optional on-chain eligibility checks.
 *
 * This is intentionally not a token/NFT drop contract and is not created by
 * LSP7DropFactory or LSP8DropFactory. Keep it isolated from on-chain minting.
 *
 * Storage layout in Vercel KV:
 *   sdrop:{id}           → SecretDropConfig JSON (no codes)
 *   sdrop:{id}:pool      → Redis LIST of available code strings (LPOP to claim)
 *   sdrop:{id}:code_uses:{base64(code)} → number (times a shared code has been given out)
 *   sdrop:{id}:claimed:{address_lower}  → ClaimRecord JSON
 */

export type TokenReq = {
  address: string;   // token contract address
  minBalance: string; // as wei string (or "0" = just hold any)
};

export type FollowerReq = {
  followAddress: string; // claimer must follow this address
};

export type SecretDropMode =
  | "pool"    // N unique codes — each given to exactly one person (LPOP)
  | "shared"; // one shared code (or limited-use codes per code)

export interface SecretDropConfig {
  id: string;
  creator: string;         // UP address that created this drop (lowercase)
  title: string;
  description: string;     // Shown to claimers — describe what they get (not the code)
  mode: SecretDropMode;
  codeUsageLimit: number;  // shared mode only: how many times each code can be given out
  active: boolean;
  isPublic: boolean;       // opt-in to show on Explore feed (default false)
  image: string | null;    // IPFS CID of drop icon (default null)
  network: "mainnet" | "testnet";
  tokenRequirements: TokenReq[];
  followerRequirement: FollowerReq | null; // must follow this address
  minFollowers: number;   // claimer must have at least this many followers (0 = none)
  createdAt: number;      // unix timestamp
  totalCodes: number;     // how many codes were originally loaded
}

export interface ClaimRecord {
  address: string;
  claimedAt: number;
  code: string; // the code given to this claimer
}

// Returned to the frontend — public info only, no codes
export type PublicDropInfo = Omit<SecretDropConfig, "creator"> & {
  creator: string;
  remaining: number | null; // null if shared mode
};

// Summary returned by /api/secret-drop/by-creator for listing
export interface SecretDropSummary {
  id: string;
  title: string;
  mode: SecretDropMode;
  active: boolean;
  isPublic: boolean;
  creator: string;
  image: string | null;
  network: "mainnet" | "testnet";
  createdAt: number;
  totalCodes: number;
  remaining: number | null; // null if shared mode
}
