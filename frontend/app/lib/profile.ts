import { Contract, JsonRpcProvider, toUtf8String, dataSlice, toNumber } from "ethers";

const LUKSO_RPC = "https://rpc.mainnet.lukso.network";
const IPFS_GATEWAY = "https://api.universalprofile.cloud/ipfs/";

// LSP3Profile data key: keccak256("LSP3Profile")
const LSP3_PROFILE_KEY = "0x5ef83ad9559033e6e941db7d7c495acdce616347d28e90c7ce47cbfcfcad3bc5";

const UP_ABI = ["function getData(bytes32) view returns (bytes)"];

export interface ProfileInfo {
  name: string;
  image: string | null;
  address: string;
}

function ipfsToHttp(url: string): string {
  if (url.startsWith("ipfs://")) {
    return IPFS_GATEWAY + url.slice(7);
  }
  return url;
}

/**
 * Decode VerifiableURI from raw bytes.
 * Format: 0x0000 (2 bytes verification method) + hash length (2 bytes) + hash + url (utf8)
 * Simplified: skip verification, extract URL from the end.
 */
function decodeVerifiableURI(data: string): string | null {
  if (!data || data === "0x" || data.length < 10) return null;
  try {
    // Verification method: bytes 0-1 (after 0x prefix)
    // Hash length: bytes at position 2-3 (uint16)
    const hashLength = toNumber(dataSlice(data, 2, 4));
    // URL starts after: 2 (method) + 2 (hash length) + hashLength bytes
    const urlOffset = 4 + hashLength;
    const urlBytes = dataSlice(data, urlOffset);
    return toUtf8String(urlBytes);
  } catch {
    return null;
  }
}

export async function fetchProfile(address: string): Promise<ProfileInfo> {
  const result: ProfileInfo = { name: "", image: null, address };

  try {
    const rpc = new JsonRpcProvider(LUKSO_RPC);
    const up = new Contract(address, UP_ABI, rpc);
    const rawData = await up.getData(LSP3_PROFILE_KEY);

    const jsonUrl = decodeVerifiableURI(rawData);
    if (!jsonUrl) return result;

    const httpUrl = ipfsToHttp(jsonUrl);
    const res = await fetch(httpUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return result;

    const json = await res.json();
    const profile = json.LSP3Profile || json;

    if (profile.name) {
      result.name = profile.name;
    }

    if (profile.profileImage && profile.profileImage.length > 0) {
      // Pick smallest image >= 64px, or just the first one
      const images = profile.profileImage.sort(
        (a: any, b: any) => (a.width || 0) - (b.width || 0)
      );
      const suitable = images.find((img: any) => (img.width || 0) >= 64) || images[0];
      if (suitable?.url) {
        result.image = ipfsToHttp(suitable.url);
      }
    }
  } catch (e) {
    console.error("Failed to fetch profile:", e);
  }

  return result;
}
