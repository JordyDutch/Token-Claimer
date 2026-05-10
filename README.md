# Token Claimer — LUKSO Drop Tool

Claimable LSP7/LSP8 drops for artists, livestreams, events, and communities on LUKSO.

## What it ships

- **On-chain drops** — `LSP7ClaimableToken` and `LSP8ClaimableNFT` created through factories.
- **Factory model** — one active LSP7 factory and one active LSP8 factory; old factories stay listed for discovery.
- **Claim gates** — token balances, LSP26 minimum follower count, required follow address, optional lightweight codeword.
- **Secret Drops** — separate off-chain module backed by Vercel KV for distributing private codes/links after signed wallet verification.
- **Frontend** — Next.js app with LUKSO mainnet/testnet support.

## Current active addresses

### Mainnet

- LSP7 factory: `0x0B38Ca584553Ec7dA412403c9537B2C0Cd094bf0`
- LSP8 factory: `0xdcA867387df33b9ce08B706fdb91FB2e8C4bEB74`
- LSP26 registry: `0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA`

### Testnet

- LSP7 factory: `0x51480Ab4EB8529846d495AA9745dcc0B39362Ebe`
- LSP8 factory: `0xE0FEC12979636dE2a747B7F6944aD263FC58c85A`

Factory history lives in `frontend/app/lib/networks.ts`. When redeploying, move old active factories into `allLsp7Factories` / `allLsp8Factories` before changing the active address.

## Quick start

```bash
npm install
cp .env.example .env
npm run compile
npm test
```

Deploy factories:

```bash
LSP26_REGISTRY=0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA npm run deploy:factory
```

Deploy frontend:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run lint
npm run build
```

Required frontend env:

```bash
NEXT_PUBLIC_LUKSO_RPC=https://rpc.mainnet.lukso.network
NEXT_PUBLIC_LSP7_FACTORY=0x0B38Ca584553Ec7dA412403c9537B2C0Cd094bf0
NEXT_PUBLIC_LSP8_FACTORY=0xdcA867387df33b9ce08B706fdb91FB2e8C4bEB74
LSP26_REGISTRY=0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA
PINATA_JWT=...
```

Secret Drops additionally require:

```bash
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

## Architecture

```text
On-chain drops:
Next.js UI → UP Browser Extension → LSP7/LSP8 Factory → Claim Contract → LUKSO

Secret Drops:
Next.js UI → signed wallet challenge → Next.js API routes → Vercel KV → code/link delivery
```

Secret Drops are intentionally separate from the on-chain drop contracts. They do not mint tokens/NFTs and should be treated as an off-chain distribution module with on-chain eligibility checks.

## Codeword honesty

The on-chain `codeword` is a lightweight access gate, not strong secrecy:

- The plaintext is not stored; only `keccak256(codeword)` is stored.
- The plaintext is revealed in transaction calldata when someone claims with it.
- Anyone watching mempool/history can reuse a leaked codeword until supply/window/one-claim rules stop them.
- Use it for livestream phrases and low-risk drops, not for high-value secrets.

For private links/codes, use Secret Drops. Those use signed wallet challenges plus server-side KV distribution.

## Contract interface

```solidity
function claim() external;
function claimWithCode(string calldata codeword) external;

function setClaimEnabled(bool enabled) external;
function setClaimWindow(uint256 start, uint256 end) external;
function setAmountPerClaim(uint256 amount) external;
function setRequirements(
  address[] calldata tokens,
  uint256[] calldata minBalances,
  uint256 minFollowers,
  address followAddress
) external;
function setCodeword(string calldata word) external;

function getTokenRequirements() external view returns (address[] memory tokens, uint256[] memory minBalances);
function requiredFollowers() external view returns (uint256);
function requiredFollowAddress() external view returns (address);
function meetsRequirements(address user) external view returns (bool tokenOk, bool followersOk, bool followOk);
function batchMeetsRequirements(address[] calldata users) external view returns (bool[] memory tokenOk, bool[] memory followersOk, bool[] memory followOk);
```

## Notes

- LUKSO mainnet chain ID: `42` (`0x2a`).
- LUKSO testnet chain ID: `4201` (`0x1069`).
- Fans need a Universal Profile / UP Browser Extension.
- Claiming requires LYX for gas.
- `PINATA_JWT`, `KV_REST_API_URL`, and `KV_REST_API_TOKEN` are server-side only. Never prefix them with `NEXT_PUBLIC_`.

## License

MIT
