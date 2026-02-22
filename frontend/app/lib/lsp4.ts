import { keccak256, toUtf8Bytes, concat, hexlify, Contract, Signer } from "ethers";

export const LSP4_METADATA_KEY =
  "0x9afb95cacc9f95858ec44aa8c3b685511002e30ae54415823f406128b85b238e";

// Proxied through /api/ipfs (Next.js API route → Pinata server-side)
const IPFS_GATEWAY_UPLOAD = "/api/ipfs";

export interface Lsp4Link {
  title: string;
  url: string;
}

export interface Lsp4Input {
  name: string;
  description: string;
  iconFile?: File | null;
  links?: Lsp4Link[];
}

// Pin a Blob/File to IPFS via LUKSO gateway — returns CID string
async function pinToIPFS(content: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", content, filename);
  const res = await fetch(IPFS_GATEWAY_UPLOAD, { method: "POST", body: form });
  if (!res.ok) throw new Error(`IPFS upload failed: ${res.status} ${res.statusText}`);
  const json = await res.json();
  // LUKSO gateway returns Pinata-compatible shape
  const cid = json.IpfsHash ?? json.cid ?? json.Hash;
  if (!cid) throw new Error("IPFS response missing CID: " + JSON.stringify(json));
  return cid;
}

// Hash a file for LSP4 verification metadata
async function hashBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  return keccak256(bytes);
}

// Encode a VerifiableURI (LSP2): 0x6f357c6a + keccak256(content) + ipfs://CID
function encodeVerifiableURI(hash: string, ipfsCID: string): string {
  const METHOD_ID = "0x6f357c6a";
  const url = `ipfs://${ipfsCID}`;
  const urlBytes = toUtf8Bytes(url);
  // hash is already 0x-prefixed 32-byte hex from keccak256
  const encoded = concat([METHOD_ID, hash, urlBytes]);
  return hexlify(encoded);
}

export async function uploadAndSetLSP4Metadata(
  contractAddress: string,
  signer: Signer,
  input: Lsp4Input,
  onProgress?: (msg: string) => void
): Promise<void> {
  const log = onProgress ?? (() => {});

  // 1. Upload icon if provided
  let iconArray: object[] = [];
  if (input.iconFile) {
    log("Uploading icon to IPFS...");
    const iconHash = await hashBlob(input.iconFile);
    const iconCID = await pinToIPFS(input.iconFile, input.iconFile.name);
    iconArray = [
      {
        width: 0,
        height: 0,
        url: `ipfs://${iconCID}`,
        verification: {
          method: "keccak256(bytes)",
          data: iconHash,
        },
      },
    ];
  }

  // 2. Build LSP4Metadata JSON
  const metadata = {
    LSP4Metadata: {
      name: input.name,
      description: input.description,
      links: (input.links ?? []).filter((l) => l.title && l.url),
      icon: iconArray,
      images: [],
      assets: [],
      attributes: [],
    },
  };

  // 3. Pin metadata JSON
  log("Uploading metadata to IPFS...");
  const jsonStr = JSON.stringify(metadata);
  const jsonBlob = new Blob([jsonStr], { type: "application/json" });
  const jsonHash = keccak256(toUtf8Bytes(jsonStr));
  const jsonCID = await pinToIPFS(jsonBlob, "LSP4Metadata.json");

  // 4. Encode VerifiableURI
  const verifiableURI = encodeVerifiableURI(jsonHash, jsonCID);

  // 5. setData on the deployed contract
  log("Setting LSP4 metadata on-chain... confirm in wallet");
  const contract = new Contract(
    contractAddress,
    ["function setData(bytes32 key, bytes calldata value) external"],
    signer
  );
  const tx = await contract.setData(LSP4_METADATA_KEY, verifiableURI);
  log("Waiting for confirmation...");
  await tx.wait();
}
