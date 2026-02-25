/**
 * Server-side only — verifies wallet signatures and on-chain requirements.
 * Never imported by client code.
 */

import { verifyMessage, hashMessage, JsonRpcProvider, Contract, getAddress } from "ethers";
import { TokenReq, FollowerReq } from "../secret-drop";

const MAINNET_RPC = "https://rpc.mainnet.lukso.network";
const TESTNET_RPC = "https://rpc.testnet.lukso.network";
const LSP26_REGISTRY = "0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA";

const EIP1271_MAGIC = "0x1626ba7e";
const EIP1271_ABI = [
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
];

const LSP26_ABI = [
  "function followerCount(address addr) view returns (uint256)",
  "function isFollowing(address follower, address addr) view returns (bool)",
];

const TOKEN_ABI = [
  "function balanceOf(address account) view returns (uint256)",
];

/**
 * Verify a signature against an expected address.
 * First tries EIP-191 recovery (works for EOAs).
 * Falls back to EIP-1271 on-chain verification (works for Universal Profiles / smart contract wallets).
 */
export async function verifySig(
  message: string,
  signature: string,
  expectedAddress: string,
  network: "mainnet" | "testnet" = "mainnet"
): Promise<boolean> {
  try {
    // 1. Try standard EOA recovery
    const recovered = verifyMessage(message, signature);
    if (recovered.toLowerCase() === expectedAddress.toLowerCase()) return true;

    // 2. Fallback: EIP-1271 smart-contract signature (Universal Profile)
    const rpc = new JsonRpcProvider(network === "testnet" ? TESTNET_RPC : MAINNET_RPC);
    const hash = hashMessage(message);
    const contract = new Contract(expectedAddress, EIP1271_ABI, rpc);
    const result: string = await contract.isValidSignature(hash, signature);
    return result.toLowerCase() === EIP1271_MAGIC;
  } catch {
    return false;
  }
}

/**
 * Parse the claim challenge message and extract the embedded timestamp.
 * Expected format: "Claim drop {id} as {address} at {timestamp}"
 */
export function parseClaimMessage(message: string): { dropId: string; address: string; ts: number } | null {
  const m = message.match(/^Claim drop ([a-z0-9-]+) as (0x[a-fA-F0-9]{40}) at (\d+)$/);
  if (!m) return null;
  return { dropId: m[1], address: m[2], ts: parseInt(m[3], 10) };
}

/**
 * Parse the create-drop challenge message.
 * Expected format: "Create secret drop as {address} at {timestamp}"
 */
export function parseCreateMessage(message: string): { address: string; ts: number } | null {
  const m = message.match(/^Create secret drop as (0x[a-fA-F0-9]{40}) at (\d+)$/);
  if (!m) return null;
  return { address: m[1], ts: parseInt(m[2], 10) };
}

/** Returns true if timestamp is within the last 5 minutes. */
export function isFresh(ts: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return ts <= now && now - ts < 300; // max 5 minutes old
}

/** Check all on-chain requirements for a claimer address. */
export async function checkOnChainRequirements(
  address: string,
  tokenRequirements: TokenReq[],
  followerRequirement: FollowerReq | null,
  minFollowers: number,
  network: "mainnet" | "testnet"
): Promise<{ ok: boolean; reason?: string }> {
  const rpc = new JsonRpcProvider(network === "testnet" ? TESTNET_RPC : MAINNET_RPC);

  // Token balance checks
  for (const req of tokenRequirements) {
    try {
      const token = new Contract(req.address, TOKEN_ABI, rpc);
      const balance: bigint = await token.balanceOf(address);
      const min = BigInt(req.minBalance);
      if (min > BigInt(0) && balance < min) {
        return { ok: false, reason: `Insufficient balance for token ${req.address}` };
      }
      if (min === BigInt(0) && balance === BigInt(0)) {
        return { ok: false, reason: `Must hold token ${req.address}` };
      }
    } catch {
      return { ok: false, reason: `Could not verify token balance for ${req.address}` };
    }
  }

  // LSP26 follower checks
  if (followerRequirement || minFollowers > 0) {
    try {
      const lsp26 = new Contract(LSP26_REGISTRY, LSP26_ABI, rpc);

      if (minFollowers > 0) {
        const count: bigint = await lsp26.followerCount(address);
        if (Number(count) < minFollowers) {
          return { ok: false, reason: `Need at least ${minFollowers} followers` };
        }
      }

      if (followerRequirement) {
        const follows: boolean = await lsp26.isFollowing(address, followerRequirement.followAddress);
        if (!follows) {
          return {
            ok: false,
            reason: `Must follow ${followerRequirement.followAddress}`,
          };
        }
      }
    } catch {
      return { ok: false, reason: "Could not verify follower requirements" };
    }
  }

  return { ok: true };
}

/** Normalise an Ethereum address to lowercase. Throws if invalid. */
export function normaliseAddress(addr: string): string {
  return getAddress(addr).toLowerCase();
}
