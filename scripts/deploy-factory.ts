import { ethers } from "hardhat";

/**
 * Deploy script for Token Claimer factories using EIP-1167 minimal proxy pattern.
 *
 * Architecture:
 * ┌─────────────────────────┐       ┌──────────────────────────────┐
 * │  LSP7ClaimableToken     │       │  LSP8ClaimableNFT            │
 * │  (implementation)       │       │  (implementation)            │
 * │  - deployed once        │       │  - deployed once             │
 * │  - never used directly  │       │  - never used directly       │
 * └────────────┬────────────┘       └──────────────┬───────────────┘
 *              │                                    │
 *   referenced by                        referenced by
 *              │                                    │
 * ┌────────────▼────────────┐       ┌──────────────▼───────────────┐
 * │  LSP7DropFactory        │       │  LSP8DropFactory             │
 * │  - Clones.clone(impl)   │       │  - Clones.clone(impl)       │
 * │  - proxy.initialize()   │       │  - proxy.initialize()       │
 * │  - ~10x cheaper creates │       │  - ~10x cheaper creates     │
 * └─────────────────────────┘       └──────────────────────────────┘
 *
 * Each createTokenDrop / createNFTDrop call deploys a tiny EIP-1167 proxy (~45 bytes)
 * that delegates all calls to the implementation contract. This replaces deploying
 * the full ~16KB bytecode each time, saving ~90% gas per campaign creation.
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "LYX\n");

  // ─────────────── Step 1: Deploy LSP7 Implementation ───────────────
  // This is the master copy. It uses initialize() instead of a constructor.
  // It must NEVER be initialized directly — it serves only as a delegate target.

  console.log("Step 1/4: Deploying LSP7ClaimableToken implementation...");
  const LSP7Impl = await ethers.getContractFactory("LSP7ClaimableToken");
  const lsp7Impl = await LSP7Impl.deploy();
  await lsp7Impl.waitForDeployment();
  const lsp7ImplAddr = await lsp7Impl.getAddress();
  console.log("  LSP7ClaimableToken (impl):", lsp7ImplAddr);

  // ─────────────── Step 2: Deploy LSP7 Factory ───────────────
  // Factory stores the implementation address and uses Clones.clone() internally.

  console.log("Step 2/4: Deploying LSP7DropFactory...");
  const LSP7Factory = await ethers.getContractFactory("LSP7DropFactory");
  const lsp7Factory = await LSP7Factory.deploy(lsp7ImplAddr);
  await lsp7Factory.waitForDeployment();
  const lsp7FactoryAddr = await lsp7Factory.getAddress();
  console.log("  LSP7DropFactory:", lsp7FactoryAddr);

  // ─────────────── Step 3: Deploy LSP8 Implementation ───────────────

  console.log("Step 3/4: Deploying LSP8ClaimableNFT implementation...");
  const LSP8Impl = await ethers.getContractFactory("LSP8ClaimableNFT");
  const lsp8Impl = await LSP8Impl.deploy();
  await lsp8Impl.waitForDeployment();
  const lsp8ImplAddr = await lsp8Impl.getAddress();
  console.log("  LSP8ClaimableNFT (impl):", lsp8ImplAddr);

  // ─────────────── Step 4: Deploy LSP8 Factory ───────────────

  console.log("Step 4/4: Deploying LSP8DropFactory...");
  const LSP8Factory = await ethers.getContractFactory("LSP8DropFactory");
  const lsp8Factory = await LSP8Factory.deploy(lsp8ImplAddr);
  await lsp8Factory.waitForDeployment();
  const lsp8FactoryAddr = await lsp8Factory.getAddress();
  console.log("  LSP8DropFactory:", lsp8FactoryAddr);

  // ─────────────── Verification ───────────────
  // Confirm the factories stored the correct implementation addresses.

  console.log("\n── Verifying implementation references ──");

  const storedLsp7Impl = await lsp7Factory.implementation();
  const storedLsp8Impl = await lsp8Factory.implementation();

  const lsp7Match = storedLsp7Impl === lsp7ImplAddr;
  const lsp8Match = storedLsp8Impl === lsp8ImplAddr;

  console.log(
    `  LSP7DropFactory.implementation() = ${storedLsp7Impl} ${lsp7Match ? "✓" : "✗ MISMATCH"}`
  );
  console.log(
    `  LSP8DropFactory.implementation() = ${storedLsp8Impl} ${lsp8Match ? "✓" : "✗ MISMATCH"}`
  );

  if (!lsp7Match || !lsp8Match) {
    throw new Error("Implementation address mismatch — deployment may be corrupted!");
  }

  // ─────────────── Summary ───────────────

  console.log("\n═══════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════");
  console.log(`  LSP7ClaimableToken (impl): ${lsp7ImplAddr}`);
  console.log(`  LSP7DropFactory:           ${lsp7FactoryAddr}`);
  console.log(`  LSP8ClaimableNFT (impl):   ${lsp8ImplAddr}`);
  console.log(`  LSP8DropFactory:           ${lsp8FactoryAddr}`);
  console.log("═══════════════════════════════════════════");
  console.log("\nNext steps:");
  console.log("  1. Verify contracts on explorer (npx hardhat verify ...)");
  console.log("  2. Update frontend .env with new factory addresses");
  console.log("  3. Add old factory addresses to allLsp7Factories/allLsp8Factories");
  console.log("     in frontend/app/lib/networks.ts so existing drops stay visible");

  const balanceAfter = await ethers.provider.getBalance(deployer.address);
  const spent = balance - balanceAfter;
  console.log(`\nGas spent: ${ethers.formatEther(spent)} LYX`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
