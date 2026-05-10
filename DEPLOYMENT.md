# Deployment Guide — Token Claimer

## Factory model

Token Claimer uses factories for release hygiene and lower deployment cost:

- `LSP7DropFactory` deploys EIP-1167 minimal proxies for `LSP7ClaimableToken`.
- `LSP8DropFactory` deploys fresh `LSP8ClaimableNFT` contracts per drop to stay under EIP-170 size limits.
- Both factories are deployed with an `LSP26_REGISTRY` constructor parameter. Drops inherit that registry and use it for follower-count and required-follow checks.

## Active addresses

### Mainnet

- LSP7 factory: `0x0B38Ca584553Ec7dA412403c9537B2C0Cd094bf0`
- LSP8 factory: `0xdcA867387df33b9ce08B706fdb91FB2e8C4bEB74`
- LSP26 registry: `0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA`

### Testnet

- LSP7 factory: `0x51480Ab4EB8529846d495AA9745dcc0B39362Ebe`
- LSP8 factory: `0xE0FEC12979636dE2a747B7F6944aD263FC58c85A`

## Deploy factories

```bash
cp .env.example .env
# Edit LUKSO_RPC_URL / PRIVATE_KEY in your local setup if needed.

LSP26_REGISTRY=0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA \
  npx hardhat run scripts/deploy-factory.ts --network lukso
```

Testnet:

```bash
TESTNET_LSP26_REGISTRY=<testnet-registry-if-different> \
LSP26_REGISTRY=${TESTNET_LSP26_REGISTRY:-0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA} \
  npx hardhat run scripts/deploy-factory.ts --network luksoTestnet
```

The script prints:

- `LSP7DropFactory`
- `LSP7ClaimableToken` implementation used by the LSP7 proxy factory
- `LSP8DropFactory`
- `LSP26 registry`

## Verify contracts

`LSP7DropFactory` and `LSP8DropFactory` constructor arg is the LSP26 registry address:

```bash
npx hardhat verify --network lukso <LSP7_FACTORY_ADDRESS> 0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA
npx hardhat verify --network lukso <LSP8_FACTORY_ADDRESS> 0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA
```

The LSP7 implementation is self-deployed by the factory constructor. Read it with:

```typescript
await lsp7Factory.implementation();
```

## Frontend env

Update `.env.local` and Vercel after redeploying factories:

```bash
NEXT_PUBLIC_LUKSO_RPC=https://rpc.mainnet.lukso.network
NEXT_PUBLIC_LSP7_FACTORY=<new LSP7DropFactory>
NEXT_PUBLIC_LSP8_FACTORY=<new LSP8DropFactory>
LSP26_REGISTRY=0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA
PINATA_JWT=<server-side-only>
```

If Secret Drops are enabled:

```bash
KV_REST_API_URL=<server-side-only>
KV_REST_API_TOKEN=<server-side-only>
```

Do not expose `PINATA_JWT`, `KV_REST_API_URL`, or `KV_REST_API_TOKEN` with `NEXT_PUBLIC_`.

## Preserve old drops

When deploying new factories:

1. Add previous active addresses to `allLsp7Factories` / `allLsp8Factories` in `frontend/app/lib/networks.ts`.
2. Change `NEXT_PUBLIC_LSP7_FACTORY` / `NEXT_PUBLIC_LSP8_FACTORY` to the new active factories.
3. Run `npm run lint` and `npm run build` in `frontend`.

The frontend queries all historical factories for listing, but only the active factories create new drops.

## Creating drops

```typescript
const lsp7Factory = new ethers.Contract(LSP7_FACTORY, LSP7_FACTORY_ABI, signer);
await lsp7Factory.createTokenDrop("My Token", "MTK", amountPerClaim, maxSupply, false);

const lsp8Factory = new ethers.Contract(LSP8_FACTORY, LSP8_FACTORY_ABI, signer);
await lsp8Factory.createNFTDrop("My NFT", "MNFT", maxSupply, amountPerClaim);
```

## Managing a deployed drop

```typescript
const drop = new ethers.Contract(dropAddress, CLAIM_ABI, signer);

await drop.setClaimEnabled(true);
await drop.setClaimWindow(startTimestamp, endTimestamp);
await drop.setRequirements(tokenAddresses, minBalances, minFollowers, followAddress);
await drop.setCodeword("livestream phrase");
```

## Codeword security model

Codeword is honest but limited:

- Only `keccak256(codeword)` is stored on-chain.
- The plaintext is revealed in calldata when a claimer calls `claimWithCode`.
- Treat it as a livestream/low-risk access phrase, not private-key-level secrecy.
- For private links/codes, use the separate Secret Drops module.

## Secret Drops architecture

Secret Drops are off-chain and separate from token/NFT drop contracts:

```text
Signed UP challenge → Next.js API route → Vercel KV → one code/link returned
```

They can verify token/follower requirements on-chain, but they do not mint and are not factory-created contracts.

## Gas notes

- LSP7 factory creation is cheap because drops are minimal proxies.
- LSP8 drops are fresh deployments because LSP8 bytecode and feature set made proxy/unified-factory layouts less practical under size limits.
- Runtime claiming costs are not materially changed by the factory model.
