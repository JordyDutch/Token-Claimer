# CLAUDE.md — LUKSO Context for Claude Code

This file brings Claude Code up to speed on the LUKSO ecosystem and this project.
Read this before touching any LUKSO-related code.

---

## Project: Token Claimer

A Next.js 15 dApp on LUKSO that lets creators deploy token/NFT drop campaigns. Claimers must
hold LSP tokens and/or follow via LSP26 to be eligible.

**Repo:** `https://github.com/JordyDutch/Token-Claimer`
**Frontend:** `frontend/` (Next.js 15 + Tailwind + ethers.js v6)
**Contracts:** `contracts/` (Hardhat + Solidity 0.8.x)

---

## LUKSO Network

| Property | Mainnet | Testnet |
|----------|---------|---------|
| Chain ID | 42 (`0x2a`) | 4201 (`0x1069`) |
| RPC | `https://rpc.mainnet.lukso.network` | `https://rpc.testnet.lukso.network` |
| Explorer | `https://explorer.execution.mainnet.lukso.network` | `https://explorer.execution.testnet.lukso.network` |
| Faucet | — | `https://faucet.testnet.lukso.network` |

LUKSO is **unmodified EVM**. Standard Solidity, ethers.js, Hardhat, Foundry all work as-is.
The only difference from Ethereum is the smart contract standards (LSPs) and native token LYX.

---

## LSP Standards — What You Need to Know

### LSP0 — ERC725Account (Universal Profile)
- Interface ID: `0x24871b3d`
- The identity layer. Every user has a Universal Profile (UP) — a smart contract wallet.
- UPs can `setData(key, value)` to store arbitrary ERC725Y key-value pairs.
- UPs execute calls via `execute(operation, to, value, data)`.
- In practice: users interact with your dApp via their UP address, not an EOA.

### LSP1 — UniversalReceiver
- Interface ID: `0x6bb56a14`
- Hooks called when a UP receives tokens. If recipient doesn't implement LSP1, LSP7/LSP8 transfer
  with `force=false` **reverts**. Use `force=true` if the recipient might be a plain address.

### LSP2 — ERC725Y JSON Schema
- Standardised key-value storage. Keys are `bytes32`, values are `bytes`.
- Key types: Singleton, Array, Mapping, MappingWithGrouping.
- Array keys: `keccak256("KeyName[]")` for length + `keccak256("KeyName[]")[0:16] + index` for elements.

### LSP3 — UniversalProfile Metadata
- Stored under key `0x5ef83ad9559033e6e941db7d7c495acdce616347d28e90c7ce47cbfcfcad3bc5`
- Value is VerifiableURI pointing to JSON with `{ LSP3Profile: { name, description, profileImage, backgroundImage, tags } }`

### LSP4 — DigitalAsset Metadata
- All tokens (LSP7/LSP8) store metadata here.
- Key: `0x9afb95cacc9f95858ec44aa8c3b685511002e30ae54415823f406128b85b238e`
- TokenName: `0xdeba1e292f8ba88238e10ab3c7f88bd4be4fac56cad5194b6ecceaf653468af1`
- TokenSymbol: `0x2f0a68ab07768e01943a599e73362a0e17a63a72e94dd2e384d2c1d4db932756`
- LSP4Creators[] (array length): `0x114bd03b3a46d48759680d81ebb2b414fda7d030a7105a851867accf1c2352e7`
- LSP4Creators[0] (first element): `0x114bd03b3a46d48759680d81ebb2b41400000000000000000000000000000000`
- Value format: **VerifiableURI** (see below)

### LSP6 — KeyManager
- Controls permissions for a UP. Sits between caller and UP.
- Callers execute via `KeyManager.execute(calldata)` instead of calling UP directly.
- Key permissions: `CALL`, `SUPER_CALL`, `TRANSFERVALUE`, `SETDATA`, `SUPER_SETDATA`, `SIGN`
- Permission storage: `AddressPermissions:Permissions:<address>` → `bytes32` bitmask

### LSP7 — DigitalAsset (Fungible Token)
- Interface ID: `0x5fcaac27`
- `transfer(from, to, amount, force, data)` — note the `force` param (bool)
- `force=false`: reverts if recipient doesn't implement LSP1 (`0x6bb56a14`)
- `force=true`: transfers to any address including plain EOAs
- **No `name()` / `symbol()` view functions** — name/symbol stored in ERC725Y (LSP4 keys above)
- `decimals()` → uint8 (use this to detect LSP7 vs LSP8: LSP7 has decimals, LSP8 reverts)
- `balanceOf(address)` → uint256

### LSP8 — IdentifiableDigitalAsset (NFT)
- Interface ID: `0x1ae9ba1f`
- Token IDs are `bytes32` (not uint256 like ERC721)
- `transfer(from, to, tokenId, force, data)`
- `balanceOf(address)` → uint256 (count of tokens owned)
- **No `name()` / `symbol()`** — same as LSP7, stored in ERC725Y

### LSP12 — IssuedAssets
- Array of assets issued by a UP.
- Array key: `0x7c8c3416d6cda87cd42c71ea1843df28ac4850354f988d55ee2eaa47b6dc05cd`
- Element prefix: `0x7c8c3416d6cda87cd42c71ea1843df28`
- Used for "Verified Creator" badge: creator's UP lists the token contract here.

### LSP26 — FollowerSystem
- Registry address (mainnet + testnet): `0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA`
- `follow(address)` — follow a UP
- `followerCount(address)` → uint256
- `isFollowing(address follower, address addr)` → bool
- Does NOT store timestamps — only whether someone follows, not since when.

---

## VerifiableURI Encoding (LSP4 / LSP3 metadata)

Metadata values stored on-chain use VerifiableURI format:

```
bytes = 0x0000 (2 bytes, verification method: keccak256)
      + keccak256(content) (32 bytes)
      + utf8(ipfsUrl) (variable)
```

Example: `0x00006f357c6a<64-hex-hash><ipfs://Qm... in hex>`

To decode: skip `2 + 2 + 32 = 36 bytes` (or `0x` + 4 + 64 hex chars), then parse UTF-8.

In the Token Claimer code: `raw.slice(2 + 8 + 64)` skips the prefix.

---

## Key Addresses

### Contracts (Mainnet)
| Contract | Address |
|----------|---------|
| LSP7DropFactory (active) | `0x9b132E764f92c6E6F5E91E276E310758C33dB08F` |
| LSP8DropFactory (active) | `0xBd545E98F133282bD79dc4a6ac422437478A58b6` |
| LSP26 FollowerRegistry | `0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA` |

### Contracts (Testnet)
| Contract | Address |
|----------|---------|
| LSP7DropFactory | `0x58877A19286c054acBcE221c7E92ab9039Bf2909` |
| LSP8DropFactory | `0x6625eDFaca73475dD44b4dAFC8666d92e4d3CAFf` |
| LSP26 FollowerRegistry | `0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA` |

### Project UPs (Mainnet)
| Identity | Address |
|----------|---------|
| LUKSOAgent UP (agent bot) | `0x293E96ebbf264ed7715cff2b67850517De70232a` |
| LUKSOAgent KeyManager | `0xAd5481E02f8cdAabD1d3F04b7953De0FDb53F048` |
| LUKSOAgent Controller | `0xA1D8703e52d8992bFeFbd276Bf0957c125583Fc0` |

### Factory migration
If new factories are deployed, add old addresses to `allLsp7Factories`/`allLsp8Factories`
in `frontend/app/lib/networks.ts` so existing drops stay visible. See comment in that file.

---

## Token Claimer Contract Interface

### Custom Errors
```solidity
ClaimNotActive()
AlreadyClaimed()
OutsideClaimWindow()
MaxSupplyReached()
InsufficientTokenBalance()
InsufficientFollowers()
ReentrancyGuard()
RescueFailed()
WrongCodeword()
```

### Key Functions
```solidity
// Claiming
function claim() external;
function claimWithCode(string calldata codeword) external;

// Owner management
function setClaimEnabled(bool enabled);
function setClaimWindow(uint256 start, uint256 end);
function setAmountPerClaim(uint256 amount);
function setRequirements(address[] tokens, uint256[] minBalances, uint256 minFollowers);
function setCodeword(string calldata word);  // keccak256 hash stored, never plaintext
function clearCodeword();

// Views
function claimEnabled() view returns (bool);
function isClaimActive() view returns (bool);
function hasClaimed(address) view returns (bool);
function maxSupply() view returns (uint256);
function amountPerClaim() view returns (uint256);
function getTokenRequirements() view returns (address[] tokens, uint256[] minBalances);
function requiredFollowers() view returns (uint256);
function meetsRequirements(address) view returns (bool tokenOk, bool followersOk);
function codewordEnabled() view returns (bool);
```

### Token type detection
```typescript
// LSP7 has decimals(), LSP8 reverts
async function detectTokenType(contract): Promise<"LSP7" | "LSP8"> {
  try { await contract.decimals(); return "LSP7"; }
  catch { return "LSP8"; }
}
```

### `getTokenRequirements()` selector
`0x8232e30f` — if a contract reverts with `0xbb370b2b` (NoExtensionFoundForFunctionSelector),
the contract was deployed with an old factory that doesn't have this function.

---

## Frontend Architecture

```
frontend/app/
├── lib/
│   ├── networks.ts          # NetworkConfig type, NETWORKS registry (mainnet + testnet)
│   ├── contracts.ts         # ABIs, factory addresses, getProvider(), detectTokenType()
│   ├── lsp4.ts              # IPFS upload, VerifiableURI encoding, setData on-chain
│   └── profile.ts           # fetchProfile() — always reads mainnet, handles 0x return
├── components/
│   ├── NetworkProvider.tsx  # React context with localStorage persistence, useNetwork()
│   ├── WalletProvider.tsx   # UP wallet connect, useWallet()
│   ├── Header.tsx           # Network toggle badge
│   └── TestnetBanner.tsx    # Amber bar on testnet
├── create/page.tsx          # Deploy new drop (token or NFT)
├── claim/[address]/page.tsx # Public claim page
├── manage/[address]/page.tsx # Owner management
└── my-drops/page.tsx        # Creator's drop list
```

### Network context
```typescript
const { config: networkConfig, networkId } = useNetwork();
// networkConfig.rpc, .lsp7Factory, .lsp8Factory, .allLsp7Factories, .allLsp8Factories
```

### Wallet context
```typescript
const { address, profile, connect, disconnect } = useWallet();
// address = connected UP address (checksummed)
```

### Connecting UP wallet (browser extension)
```typescript
// frontend/app/lib/contracts.ts
export function getProvider() {
  return (window as any).lukso || (window as any).ethereum || null;
}
// Then: new BrowserProvider(getProvider()) → signer → contract.connect(signer)
```

---

## IPFS

- **Read gateway:** `https://api.universalprofile.cloud/ipfs/{CID}`
- **Upload:** Via Next.js API route `/api/ipfs` → Pinata (`PINATA_JWT` env var, server-side only)
- Never expose `PINATA_JWT` in frontend; never use `NEXT_PUBLIC_PINATA_JWT`

---

## Envio Indexer (GraphQL)

- Mainnet: `https://envio.lukso-mainnet.universal.tech/v1/graphql`
- Testnet: `https://envio.lukso-testnet.universal.tech/v1/graphql`

Resolve username → UP address:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"query":"{ Profile(where: {name: {_eq: \"username\"}}) { id name } }"}' \
  https://envio.lukso-mainnet.universal.tech/v1/graphql
```

---

## Common Gotchas

### 1. No `name()` / `symbol()` on LSP7/LSP8
They don't exist as Solidity view functions. Name/symbol are ERC725Y data under LSP4 keys.
Use `getData(LSP4_TOKEN_NAME_KEY)` and decode from bytes.

### 2. `force=false` reverts if recipient isn't LSP1
When minting/transferring LSP7 or LSP8 with `force=false`, the recipient contract must
implement `universalReceiver()` (interface ID `0x6bb56a14`). Plain EOAs don't, so they revert.
Use `force=true` when in doubt or when recipients may be EOAs.

### 3. LSP8 token IDs are `bytes32`
Not uint256 like ERC721. Auto-generate with `bytes32(uint256(tokenCounter))` or
`keccak256(abi.encodePacked(recipient, block.timestamp))`.

### 4. Profile fetch returns `0x` on testnet EOAs
If an address has no UP data (pure EOA or no data set), `getData()` returns `0x`.
ABI-decode will throw `BAD_DATA`. Always check `raw !== "0x"` before decoding.
Use `provider.call()` directly instead of ethers Contract abstraction for this reason.

### 5. UP address vs EOA
Users' `address` from wallet connect is their **UP address** (a smart contract), not their EOA
signing key. The EOA is the KeyManager controller. Most dApp interactions use the UP address.

### 6. EIP-170 bytecode size limit
Max 24,576 bytes per contract. The unified factory exceeded this → was split into
LSP7DropFactory and LSP8DropFactory. Keep an eye on contract size when adding features.

### 7. LSP26 no timestamps
`isFollowing(a, b)` → bool. There is no "followed since" data. Cannot require "must have
followed for N days" without an off-chain indexer.

### 8. `setDataBatch` for multiple keys in one tx
```solidity
bytes32[] memory keys = new bytes32[](2);
bytes[] memory values = new bytes[](2);
keys[0] = LSP4_METADATA_KEY;
values[0] = verifiableURI;
keys[1] = LSP4_CREATORS_ARRAY_KEY;
values[1] = abi.encode(1); // array length 1
contract.setDataBatch(keys, values);
```

### 9. LSP12IssuedAssets[] — bidirectional linking
"Verified Creator" requires:
1. Token contract has `LSP4Creators[0]` set to creator's UP address
2. Creator's UP has `LSP12IssuedAssets[n]` set to token contract address
Both are needed for the badge to show on universal.page.

---

## LSP26 Follow — Raw Call Pattern

The follower registry is a standalone contract. Call it via the UP's execute:

```typescript
const LSP26_ABI = ["function follow(address) external"];
const lsp26 = new Contract("0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA", LSP26_ABI, provider);
const calldata = lsp26.interface.encodeFunctionData("follow", [targetAddress]);
// Then UP.execute(0, lsp26Address, 0, calldata) via KeyManager
```

---

## Hardhat Test Patterns

### Mock LSP26
```typescript
// hre.network.provider.send("hardhat_setCode", [lsp26Address, mockBytecode])
// Deploy MockLSP26 locally, then impersonate its address
```

### Detect LSP7 vs LSP8 in tests
```typescript
// LSP7 has decimals(), LSP8 doesn't
const isLSP7 = await contract.decimals().then(() => true).catch(() => false);
```

### Custom error assertions
```typescript
await expect(contract.claim()).to.be.revertedWithCustomError(contract, "AlreadyClaimed");
```

---

## Git Workflow

- Never `git add .` — always add files individually (`.credentials` leak risk)
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
- Feature branches for PRs, never push directly to main of forks

---

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_LUKSO_RPC` | Vercel / `.env.local` | Mainnet RPC override |
| `NEXT_PUBLIC_LSP7_FACTORY` | Vercel / `.env.local` | Active LSP7 factory |
| `NEXT_PUBLIC_LSP8_FACTORY` | Vercel / `.env.local` | Active LSP8 factory |
| `NEXT_PUBLIC_TESTNET_LSP7_FACTORY` | Vercel / `.env.local` | Testnet LSP7 factory |
| `NEXT_PUBLIC_TESTNET_LSP8_FACTORY` | Vercel / `.env.local` | Testnet LSP8 factory |
| `PINATA_JWT` | Vercel / `.env.local` | IPFS upload (server-side only, no NEXT_PUBLIC_) |
| `KV_REST_API_URL` | Vercel / `.env.local` | Upstash Redis (Secret Drops) |
| `KV_REST_API_TOKEN` | Vercel / `.env.local` | Upstash Redis (Secret Drops) |
