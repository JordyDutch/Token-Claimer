import { keccak256, toUtf8Bytes, concat, hexlify, Contract, Signer } from "ethers";

export const LSP4_METADATA_KEY =
  "0x9afb95cacc9f95858ec44aa8c3b685511002e30ae54415823f406128b85b238e";

// LSP4Creators[] — array of creator UP addresses stored on the token/NFT contract
export const LSP4_CREATORS_ARRAY_KEY =
  "0x114bd03b3a46d48759680d81ebb2b414fda7d030a7105a851867accf1c2352e7";
// LSP4Creators[0] — first (and typically only) element key
export const LSP4_CREATORS_ELEMENT_0_KEY =
  "0x114bd03b3a46d48759680d81ebb2b41400000000000000000000000000000000";

// LSP12IssuedAssets[] — array of issued asset contract addresses stored on the creator's UP
export const LSP12_ISSUED_ASSETS_ARRAY_KEY =
  "0x7c8c3416d6cda87cd42c71ea1843df28ac4850354f988d55ee2eaa47b6dc05cd";
// First 16 bytes of the array key — used as prefix for element keys
const LSP12_ISSUED_ASSETS_INDEX_PREFIX = "7c8c3416d6cda87cd42c71ea1843df28";

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
  assetFiles?: File[];
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
  onProgress?: (msg: string) => void,
  creatorAddress?: string,  // if provided, also sets LSP4Creators[] in the same tx
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

  // 2. Upload asset files if provided
  const assetsArray: object[] = [];
  if (input.assetFiles && input.assetFiles.length > 0) {
    for (let i = 0; i < input.assetFiles.length; i++) {
      const file = input.assetFiles[i];
      log(`Uploading asset ${i + 1}/${input.assetFiles.length} to IPFS...`);
      const hash = await hashBlob(file);
      const cid = await pinToIPFS(file, file.name);
      assetsArray.push({
        url: `ipfs://${cid}`,
        verification: {
          method: "keccak256(bytes)",
          data: hash,
        },
      });
    }
  }

  // 3. Build LSP4Metadata JSON
  const metadata = {
    LSP4Metadata: {
      name: input.name,
      description: input.description,
      links: (input.links ?? []).filter((l) => l.title && l.url),
      icon: iconArray,
      images: [],
      assets: assetsArray,
      attributes: [],
    },
  };

  // 4. Pin metadata JSON
  log("Uploading metadata to IPFS...");
  const jsonStr = JSON.stringify(metadata);
  const jsonBlob = new Blob([jsonStr], { type: "application/json" });
  const jsonHash = keccak256(toUtf8Bytes(jsonStr));
  const jsonCID = await pinToIPFS(jsonBlob, "LSP4Metadata.json");

  // 5. Encode VerifiableURI
  const verifiableURI = encodeVerifiableURI(jsonHash, jsonCID);

  // 6. setData(Batch) on the deployed contract
  log("Setting LSP4 metadata on-chain... confirm in wallet");

  if (creatorAddress) {
    // setDataBatch: LSP4Metadata + LSP4Creators[] in one tx
    const contract = new Contract(
      contractAddress,
      ["function setDataBatch(bytes32[] calldata dataKeys, bytes[] calldata dataValues) external payable"],
      signer
    );
    // LSP4Creators[]: length = 1, element[0] = creator address (20 bytes)
    const creatorLengthVal = "0x00000000000000000000000000000001"; // uint128 = 1
    const creatorAddrVal = "0x" + creatorAddress.toLowerCase().replace("0x", "");
    const tx = await contract.setDataBatch(
      [LSP4_METADATA_KEY, LSP4_CREATORS_ARRAY_KEY, LSP4_CREATORS_ELEMENT_0_KEY],
      [verifiableURI, creatorLengthVal, creatorAddrVal]
    );
    log("Waiting for confirmation...");
    await tx.wait();
  } else {
    const contract = new Contract(
      contractAddress,
      ["function setData(bytes32 key, bytes calldata value) external"],
      signer
    );
    const tx = await contract.setData(LSP4_METADATA_KEY, verifiableURI);
    log("Waiting for confirmation...");
    await tx.wait();
  }
}

// ---------------------------------------------------------------------------
// LSP4Creators — set creator on an existing contract (manage page use case)
// ---------------------------------------------------------------------------

export async function setLSP4Creators(
  contractAddress: string,
  creatorAddress: string,
  signer: Signer,
  onProgress?: (msg: string) => void
): Promise<void> {
  const log = onProgress ?? (() => {});
  log("Setting LSP4Creators on contract... confirm in wallet");
  const contract = new Contract(
    contractAddress,
    ["function setDataBatch(bytes32[] calldata dataKeys, bytes[] calldata dataValues) external payable"],
    signer
  );
  const creatorLengthVal = "0x00000000000000000000000000000001";
  const creatorAddrVal = "0x" + creatorAddress.toLowerCase().replace("0x", "");
  const tx = await contract.setDataBatch(
    [LSP4_CREATORS_ARRAY_KEY, LSP4_CREATORS_ELEMENT_0_KEY],
    [creatorLengthVal, creatorAddrVal]
  );
  log("Waiting for confirmation...");
  await tx.wait();
}

// ---------------------------------------------------------------------------
// LSP12 — add a newly deployed asset to the creator's UP's IssuedAssets list
// ---------------------------------------------------------------------------

export async function addToLSP12IssuedAssets(
  upAddress: string,
  contractAddress: string,
  signer: Signer,
  onProgress?: (msg: string) => void
): Promise<void> {
  const log = onProgress ?? (() => {});

  const ERC725Y_ABI = [
    "function getData(bytes32 dataKey) view returns (bytes memory)",
    "function setDataBatch(bytes32[] calldata dataKeys, bytes[] calldata dataValues) external payable",
  ];
  const up = new Contract(upAddress, ERC725Y_ABI, signer);

  // Read current array length from UP
  let currentLength = 0;
  try {
    const rawLength: string = await up.getData(LSP12_ISSUED_ASSETS_ARRAY_KEY);
    if (rawLength && rawLength !== "0x" && rawLength.length > 2) {
      currentLength = parseInt(rawLength, 16);
    }
  } catch { /* starts at 0 */ }

  const newLength = currentLength + 1;
  // Element key: first 16 bytes of array key + index as uint128 (16 bytes)
  const indexHex = currentLength.toString(16).padStart(32, "0");
  const elementKey = "0x" + LSP12_ISSUED_ASSETS_INDEX_PREFIX + indexHex;

  // New length encoded as uint128 (16 bytes)
  const newLengthVal = "0x" + newLength.toString(16).padStart(32, "0");
  // Contract address as bytes20
  const contractAddrVal = "0x" + contractAddress.toLowerCase().replace("0x", "");

  log("Adding to your UP's issued assets... confirm in wallet");
  const tx = await up.setDataBatch(
    [LSP12_ISSUED_ASSETS_ARRAY_KEY, elementKey],
    [newLengthVal, contractAddrVal]
  );
  log("Waiting for confirmation...");
  await tx.wait();
}
