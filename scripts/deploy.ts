import { ethers } from "hardhat";

async function main() {
  const type = process.env.TOKEN_TYPE || "LSP8"; // "LSP7" or "LSP8"
  const name = process.env.NFT_NAME || "Livestream Drop";
  const symbol = process.env.NFT_SYMBOL || "DROP";
  const maxSupply = parseInt(process.env.MAX_SUPPLY || "0");
  const amountPerClaim = parseInt(process.env.AMOUNT_PER_CLAIM || "1");
  const decimals = parseInt(process.env.DECIMALS || "18");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log(`Type: ${type}\n`);

  if (type === "LSP7") {
    const Factory = await ethers.getContractFactory("LSP7ClaimableToken");
    const token = await Factory.deploy(name, symbol, deployer.address, amountPerClaim, maxSupply, decimals);
    await token.waitForDeployment();
    const addr = await token.getAddress();
    console.log(`✅ LSP7ClaimableToken deployed: ${addr}`);
    console.log(`   Amount per claim: ${amountPerClaim}`);
    console.log(`   Decimals: ${decimals}`);
  } else {
    const Factory = await ethers.getContractFactory("LSP8ClaimableNFT");
    const nft = await Factory.deploy(name, symbol, deployer.address, maxSupply, amountPerClaim);
    await nft.waitForDeployment();
    const addr = await nft.getAddress();
    console.log(`✅ LSP8ClaimableNFT deployed: ${addr}`);
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
