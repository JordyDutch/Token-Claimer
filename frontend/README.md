# Token Claimer — Frontend

A Next.js frontend for creating and claiming LSP7 token and LSP8 NFT drops on [LUKSO](https://lukso.network).

## Features

### For Creators
- **Create drops** — Deploy LSP7 (fungible token) or LSP8 (NFT) claim campaigns via factory contracts
- **LSP4 metadata** — Upload icon, description, links, and asset files to IPFS with on-chain VerifiableURI storage
- **My Drops dashboard** — View all your drops with live stats (status, claimed count, supply)
- **Manage drops** — Toggle claims on/off, set claim windows, update amount per claim, set token/follower requirements

### For Claimers
- **Discover drops** — Browse, search, and filter all drops (tokens, NFTs, or your own)
- **Claim tokens/NFTs** — Connect Universal Profile, check eligibility, and claim in one click
- **Eligibility checks** — Automatic verification of token balance and follower requirements

### UX
- **Shared wallet context** — Connect once, stay connected across all pages
- **Loading skeletons** — Smooth loading states on every page
- **Mobile-first** — Responsive design with touch optimization and safe area support
- **Copy & share** — Copy contract addresses, claim links, and share drops

## Tech Stack

- **Next.js 16** with App Router
- **React 19**
- **ethers v6** for smart contract interactions
- **Tailwind CSS v4**
- **TypeScript 5**

## Pages

| Route | Description |
|---|---|
| `/` | Explore all drops with search and filters |
| `/create` | Deploy a new token or NFT drop |
| `/claim/[address]` | Claim page for a specific drop |
| `/manage/[address]` | Owner management panel for a drop |
| `/my-drops` | Creator dashboard — all your drops with quick actions |
| `/api/ipfs` | Server-side IPFS upload proxy (Pinata) |

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_LUKSO_RPC` | LUKSO RPC endpoint |
| `NEXT_PUBLIC_LSP7_FACTORY` | Deployed LSP7 factory contract address |
| `NEXT_PUBLIC_LSP8_FACTORY` | Deployed LSP8 factory contract address |
| `PINATA_JWT` | Pinata API key for IPFS uploads (server-side only) |

### 3. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  components/
    Header.tsx          # Sticky navigation bar
    Footer.tsx          # Shared footer
    CopyButton.tsx      # Copy-to-clipboard utility
    WalletProvider.tsx   # Shared wallet context (connect once, use everywhere)
  lib/
    contracts.ts        # ABIs, factory addresses, wallet helpers
    lsp4.ts             # LSP4 metadata upload (icon, assets, links → IPFS → on-chain)
    profile.ts          # LUKSO Universal Profile resolution (LSP3)
  api/ipfs/
    route.ts            # Server-side Pinata proxy (keeps JWT secret)
  page.tsx              # Home — explore drops
  create/page.tsx       # Create a drop
  claim/[address]/      # Claim page
  manage/[address]/     # Manage page
  my-drops/page.tsx     # Creator dashboard
```

## Deploy

Deploy to [Vercel](https://vercel.com) with one click — set the environment variables in the Vercel dashboard.

Make sure `PINATA_JWT` is added as a server-side environment variable (not prefixed with `NEXT_PUBLIC_`).
