# Deployment Guide — Token Claimer (Proxy Pattern)

## Architecture: EIP-1167 Minimal Proxies

Token Claimer factories now use the **EIP-1167 minimal proxy pattern** (via OpenZeppelin's `Clones` library) instead of deploying full contract bytecode for every campaign.

### Before (full deployment)

Each `createTokenDrop()` call deployed the entire `LSP7ClaimableToken` bytecode (~16 KB). This cost **~3-4M gas** per campaign creation.

### After (minimal proxies)

1. A single **implementation contract** is deployed once per token type
2. Each `createTokenDrop()` call deploys a tiny **45-byte proxy** that delegates all calls to the implementation
3. The proxy is then initialized via `initialize()` with the campaign parameters

Cost: **~300-400K gas** per campaign creation — roughly **10x cheaper**.

### How it works

```
User calls factory.createTokenDrop(name, symbol, ...)
  → Factory calls Clones.clone(implementation)       // deploys 45-byte proxy
  → Factory calls proxy.initialize(name, symbol, ...)  // sets up state
  → Factory records campaign metadata
  → Returns proxy address
```

Every proxy is a fully independent contract with its own storage, but shares the implementation's code. From the outside, each proxy behaves identically to a standalone `LSP7ClaimableToken`.

---

## Deployed Contracts

After running `deploy-factory.ts`, you'll have 4 contracts:

| Contract | Role |
|---|---|
| `LSP7ClaimableToken` | Implementation (master copy, never used directly) |
| `LSP7DropFactory` | Creates LSP7 token drop campaigns via cloning |
| `LSP8ClaimableNFT` | Implementation (master copy, never used directly) |
| `LSP8DropFactory` | Creates LSP8 NFT drop campaigns via cloning |

---

## Deployment

```bash
# Testnet
npx hardhat run scripts/deploy-factory.ts --network luksoTestnet

# Mainnet
npx hardhat run scripts/deploy-factory.ts --network lukso
```

### Post-deployment

1. **Verify contracts** on the LUKSO explorer:
   ```bash
   # Verify implementations
   npx hardhat verify --network lukso <LSP7_IMPL_ADDRESS>
   npx hardhat verify --network lukso <LSP8_IMPL_ADDRESS>

   # Verify factories (pass implementation address as constructor arg)
   npx hardhat verify --network lukso <LSP7_FACTORY_ADDRESS> <LSP7_IMPL_ADDRESS>
   npx hardhat verify --network lukso <LSP8_FACTORY_ADDRESS> <LSP8_IMPL_ADDRESS>
   ```

2. **Update frontend environment variables** (`.env.local` and Vercel):
   ```
   NEXT_PUBLIC_LSP7_FACTORY=<new LSP7DropFactory address>
   NEXT_PUBLIC_LSP8_FACTORY=<new LSP8DropFactory address>
   ```

3. **Preserve old drops** — add previous factory addresses to `allLsp7Factories` / `allLsp8Factories` in `frontend/app/lib/networks.ts` so existing campaigns remain visible.

---

## Implementation Contract Safety

### Why it must not be initialized directly

The implementation contract is a bare master copy. If someone calls `initialize()` on it directly, they become the "owner" of the implementation. While this doesn't affect proxies (each proxy has its own storage), it's a known attack vector:

- An attacker could initialize the implementation and call `selfdestruct` (if available), bricking all proxies
- Even without `selfdestruct`, it's considered a hygiene issue

### Protection

The implementation contracts use OpenZeppelin's `Initializable` pattern:

- `initialize()` can only be called once per contract instance (proxy or implementation)
- The implementation's constructor calls `_disableInitializers()` to permanently lock it from being initialized
- Any call to `initialize()` on the implementation contract will revert

This is the standard OZ pattern — no extra steps needed after deployment.

### What if the implementation IS initialized?

On post-Shanghai EVM (which LUKSO uses), `selfdestruct` is neutered — it only sends ETH, it doesn't delete code. So even if the implementation were initialized by a third party, proxies would continue to work. But `_disableInitializers()` prevents this scenario entirely.

---

## Interacting with the Factory

### Creating a token drop

```typescript
import { ethers } from "ethers";

const factory = new ethers.Contract(LSP7_FACTORY_ADDRESS, LSP7_FACTORY_ABI, signer);

const tx = await factory.createTokenDrop(
  "My Token",        // name
  "MTK",             // symbol
  1000,              // amountPerClaim (tokens per claim)
  1000000,           // maxSupply (0 = unlimited)
  false              // isNonDivisible (false = 18 decimals)
);

const receipt = await tx.wait();
// Parse TokenCampaignCreated event to get the proxy address
```

### Creating an NFT drop

```typescript
const nftFactory = new ethers.Contract(LSP8_FACTORY_ADDRESS, LSP8_FACTORY_ABI, signer);

const tx = await nftFactory.createNFTDrop(
  "My NFT Collection",  // name
  "MNFT",               // symbol
  100,                   // maxSupply (0 = unlimited)
  1                      // amountPerClaim (NFTs per claim, max 50)
);

const receipt = await tx.wait();
// Parse NFTCampaignCreated event to get the proxy address
```

### Reading campaigns

```typescript
// Total campaigns
const total = await factory.totalCampaigns();

// Paginated read
const campaigns = await factory.getCampaigns(0, 10);

// By creator
const indices = await factory.getCampaignsByCreator(creatorAddress);
```

### Interacting with a deployed drop (proxy)

Once deployed, each proxy is a standard `LSP7ClaimableToken` / `LSP8ClaimableNFT`. Interact with it using the same ABI as the implementation:

```typescript
const drop = new ethers.Contract(proxyAddress, LSP7_CLAIMABLE_ABI, signer);

// Owner operations
await drop.setClaimEnabled(true);
await drop.setClaimWindow(startTimestamp, endTimestamp);
await drop.setRequirements(tokenAddresses, minBalances, minFollowers, followAddress);

// Claimer operations
await drop.claim();
await drop.claimWithCode("secret");
```

---

## Gas Comparison

| Operation | Old (full deploy) | New (proxy) | Savings |
|---|---|---|---|
| Create LSP7 drop | ~3.5M gas | ~350K gas | ~90% |
| Create LSP8 drop | ~3.8M gas | ~380K gas | ~90% |
| Claim (unchanged) | ~120K gas | ~120K gas | 0% |

The proxy pattern only saves gas on deployment. Runtime operations (claiming, owner management) cost the same since `delegatecall` adds negligible overhead (~700 gas).
