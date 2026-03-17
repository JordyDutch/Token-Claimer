import { ethers } from "hardhat";

async function main() {
  const type = process.env.TOKEN_TYPE || "LSP7-NFT"; // "LSP7", "LSP7-NFT", or "LSP8" (legacy)
  const name = process.env.NFT_NAME || "Livestream Drop";
  const symbol = process.env.NFT_SYMBOL || "DROP";
  const maxSupply = parseInt(process.env.MAX_SUPPLY || "0");
  const amountPerClaim = parseInt(process.env.AMOUNT_PER_CLAIM || "1");
  const decimals = parseInt(process.env.DECIMALS || "18");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log(`Type: ${type}\n`);

  if (type === "LSP7") {
    const isNonDivisible = process.env.IS_NON_DIVISIBLE === "true";
    const Factory = await ethers.getContractFactory("LSP7ClaimableToken");
    const token = await Factory.deploy(name, symbol, deployer.address, amountPerClaim, maxSupply, isNonDivisible);
    await token.waitForDeployment();
    const addr = await token.getAddress();
    console.log(`✅ LSP7ClaimableToken deployed: ${addr}`);
    console.log(`   Amount per claim: ${amountPerClaim}`);
    console.log(`   Non-divisible: ${isNonDivisible}`);
  } else if (type === "LSP7-NFT") {
    // New path: LSP7 non-divisible as NFT replacement
    const Factory = await ethers.getContractFactory("LSP7ClaimableToken");
    const token = await Factory.deploy(name, symbol, deployer.address, amountPerClaim, maxSupply, true);
    await token.waitForDeployment();
    const addr = await token.getAddress();
    console.log(`✅ LSP7ClaimableToken (non-divisible NFT) deployed: ${addr}`);
    console.log(`   NFTs per claim: ${amountPerClaim}`);
  } else {
    // Legacy LSP8 path — kept for backward compat
    const Factory = await ethers.getContractFactory("LSP8ClaimableNFT");
    const nft = await Factory.deploy(name, symbol, deployer.address, maxSupply, amountPerClaim);
    await nft.waitForDeployment();
    const addr = await nft.getAddress();
    console.log(`✅ LSP8ClaimableNFT (legacy) deployed: ${addr}`);
    console.log(`   NFTs per claim: ${amountPerClaim}`);
  }

  console.log(`   Name: ${name}`);
  console.log(`   Symbol: ${symbol}`);
  console.log(`   Max Supply: ${maxSupply === 0 ? "Unlimited" : maxSupply}`);
  console.log(`   Owner: ${deployer.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
