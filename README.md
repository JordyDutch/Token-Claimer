# 🎵 Token Claimer — LUKSO NFT Drop Tool

Claimable NFT drops for artists, livestreams, and events on LUKSO.

**"Go to this link and claim the NFT from this livestream!"**

## Features

- **On/off toggle** — artist controls when claims are open
- **Time windows** — optional start/end time for auto-open/close
- **One per profile** — each Universal Profile can only claim once
- **Max supply** — optional cap on total NFTs
- **Clean UI** — mobile-friendly claim page, works with UP Browser Extension

## Quick Start

### 1. Deploy the contract

```bash
npm install
cp .env.example .env
# Edit .env with your deployer key and drop settings
npm run deploy:testnet   # or deploy:mainnet
```

### 2. Run the frontend

```bash
cd frontend
npm install
cp .env.example .env
# Set VITE_CONTRACT_ADDRESS to your deployed contract
npm run dev
```

### 3. Artist controls

After deployment, the owner can call these functions (via block explorer or script):

```
setClaimEnabled(true)               // Open claims
setClaimEnabled(false)              // Close claims
setClaimWindow(startTime, endTime)  // Auto open/close at timestamps
```

## Architecture

```
[Frontend (Vite)] → [UP Browser Extension] → [LSP8ClaimableNFT Contract]
                                                    ↓
                                              Mints LSP8 NFT to claimer
```

- **Contract:** `LSP8ClaimableNFT.sol` — standard LSP8 + claim logic (~80 lines)
- **Frontend:** Vanilla HTML/TS + ethers.js — no framework needed
- **Standards:** LSP8 (NFT), LSP4 (metadata), works with LSP0 (Universal Profiles)

## For Non-Technical Artists

1. Someone deploys the contract for you (or use a deployment UI — coming soon)
2. You get a claim link: `https://yourdomain.com`
3. During your livestream: toggle claims ON
4. Share the link with your audience
5. After the stream: toggle claims OFF

## Network

- **LUKSO Mainnet** — Chain ID 42
- Fans need the [UP Browser Extension](https://docs.lukso.tech/install-up-browser-extension)
- Claiming requires a small amount of LYX for gas (or use a relay service for gasless claims)

## Roadmap

- [ ] Admin dashboard (toggle claims without block explorer)
- [ ] Gasless claims via LSP25 relay service
- [ ] Custom artwork upload (IPFS)
- [ ] Multi-drop support (one deployer, many events)
- [ ] QR code generation for live events

## License

MIT
