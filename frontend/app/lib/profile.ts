import { Contract, JsonRpcProvider, getBytes } from "ethers";

const LUKSO_RPC = "https://rpc.mainnet.lukso.network";
const IPFS_GATEWAY = "https://api.universalprofile.cloud/ipfs/";

// LSP3Profile data key: keccak256("LSP3Profile")
const LSP3_PROFILE_KEY =
  "0x5ef83ad9559033e6e941db7d7c495acdce616347d28e90c7ce47cbfcfcad3bc5";

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
 * Extract URL from VerifiableURI raw bytes.
 * Format: 0x0000 + 4 bytes verification method + 32 bytes hash + URL
 * We find the URL by looking for ipfs:// or https:// in the decoded string.
 */
function extractUrlFromVerifiableURI(hexData: string): string | null {
  if (!hexData || hexData === "0x" || hexData.length < 10) return null;
  try {
    // Convert hex to bytes then to string, find URL
    const bytes = getBytes(hexData);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

    // Find ipfs:// or https://
    let idx = text.indexOf("ipfs://");
    if (idx === -1) idx = text.indexOf("https://");
    if (idx === -1) idx = text.indexOf("http://");
    if (idx === -1) return null;

    return text.slice(idx);
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

    const jsonUrl = extractUrlFromVerifiableURI(rawData);
    if (!jsonUrl) return result;

    const httpUrl = ipfsToHttp(jsonUrl);
    const res = await fetch(httpUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return result;

    const json = await res.json();
    const profile = json.LSP3Profile || json;

    if (profile.name) {
      result.name = profile.name;
    }

    if (profile.profileImage && profile.profileImage.length > 0) {
      // Pick smallest image >= 64px wide, or first
      const images = [...profile.profileImage].sort(
        (a: any, b: any) => (a.width || 0) - (b.width || 0)
      );
      const suitable =
        images.find((img: any) => (img.width || 0) >= 64) || images[0];
      if (suitable?.url) {
        result.image = ipfsToHttp(suitable.url);
      }
    }
  } catch (e) {
    console.error("Failed to fetch profile:", e);
  }

  return result;
}
