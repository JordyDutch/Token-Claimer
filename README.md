# 🎵 Token Claimer — LUKSO Drop Tool

Claimable token drops for artists, livestreams, and events on LUKSO.

**"Go to this link and claim the NFT from this livestream!"**

## Features

- **LSP7 + LSP8** — Fungible tokens OR NFTs
- **Configurable amount** — 1 NFT, 10 NFTs, 100 tokens, 1M tokens per claim
- **On/off toggle** — artist controls when claims are open
- **Time windows** — optional start/end time for auto-open/close
- **One per profile** — each Universal Profile can only claim once
- **Max supply** — optional cap on total supply
- **Vercel-ready** — Next.js frontend, deploy in one click

## Quick Start

### 1. Deploy the contract

```bash
npm install
cp .env.example .env
# Edit .env — choose TOKEN_TYPE, set amount per claim, etc.
```

**LSP8 (NFTs):**
```bash
TOKEN_TYPE=LSP8 AMOUNT_PER_CLAIM=1 npm run deploy:testnet
```

**LSP7 (Fungible tokens):**
```bash
TOKEN_TYPE=LSP7 AMOUNT_PER_CLAIM=1000000 DECIMALS=18 npm run deploy:testnet
```

### 2. Deploy frontend to Vercel

```bash
cd frontend
npm install
```

Set environment variables in Vercel:
- `NEXT_PUBLIC_CONTRACT_ADDRESS` — your deployed contract
- `NEXT_PUBLIC_TOKEN_TYPE` — `LSP7` or `LSP8`

Then deploy:
```bash
npx vercel
```

### 3. Artist controls

After deployment, the owner can call:

```solidity
setClaimEnabled(true)               // Open claims
setClaimEnabled(false)              // Close claims
setClaimWindow(startTime, endTime)  // Auto open/close (unix timestamps)
setAmountPerClaim(amount)           // Change amount per claim
```

## Examples

| Use Case | Type | Amount Per Claim | Max Supply |
|----------|------|-----------------|------------|
| Livestream NFT | LSP8 | 1 | 0 (unlimited) |
| Concert ticket batch | LSP8 | 10 | 500 |
| Fan token airdrop | LSP7 | 1,000,000 | 100,000,000 |
| Event badge | LSP8 | 1 | 1,000 |

## Architecture

```
[Next.js Frontend] → [UP Browser Extension] → [LSP7/LSP8 Claim Contract]
     (Vercel)                                        (LUKSO)
```

- **Contracts:** `LSP7ClaimableToken.sol` + `LSP8ClaimableNFT.sol`
- **Frontend:** Next.js + Tailwind + ethers.js
- **Standards:** LSP7, LSP8, LSP4 metadata, works with LSP0 Universal Profiles

## Network

- **LUKSO Mainnet** — Chain ID 42
- Fans need the [UP Browser Extension](https://docs.lukso.tech/install-up-browser-extension)
- Claiming requires a small amount of LYX for gas

## Roadmap

- [ ] Admin dashboard (toggle claims from UI)
- [ ] Gasless claims via LSP25 relay service
- [ ] Custom artwork upload (IPFS)
- [ ] Multi-drop support (one deployer, many events)
- [ ] QR code generation for live events

## License

MIT


