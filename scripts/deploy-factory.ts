import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying factories with:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "LYX");

  // Deploy LSP7 Factory
  console.log("\nDeploying LSP7DropFactory...");
  const LSP7Factory = await ethers.getContractFactory("LSP7DropFactory");
  const lsp7Factory = await LSP7Factory.deploy();
  await lsp7Factory.waitForDeployment();
  console.log("LSP7DropFactory:", await lsp7Factory.getAddress());

  // Deploy LSP8 Factory
  console.log("\nDeploying LSP8DropFactory...");
  const LSP8Factory = await ethers.getContractFactory("LSP8DropFactory");
  const lsp8Factory = await LSP8Factory.deploy();
  await lsp8Factory.waitForDeployment();
  console.log("LSP8DropFactory:", await lsp8Factory.getAddress());

  console.log("\nDone! Both factories deployed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
