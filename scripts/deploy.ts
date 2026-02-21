import { ethers } from "hardhat";

async function main() {
  const name = process.env.NFT_NAME || "Livestream Drop";
  const symbol = process.env.NFT_SYMBOL || "DROP";
  const maxSupply = parseInt(process.env.MAX_SUPPLY || "0"); // 0 = unlimited

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Factory = await ethers.getContractFactory("LSP8ClaimableNFT");
  const nft = await Factory.deploy(name, symbol, deployer.address, maxSupply);
  await nft.waitForDeployment();

  const address = await nft.getAddress();
  console.log(`\n✅ LSP8ClaimableNFT deployed: ${address}`);
  console.log(`   Name: ${name}`);
  console.log(`   Symbol: ${symbol}`);
  console.log(`   Max Supply: ${maxSupply === 0 ? "Unlimited" : maxSupply}`);
  console.log(`   Owner: ${deployer.address}`);
  console.log(`\nClaim page: Set NEXT_PUBLIC_CONTRACT_ADDRESS=${address} in frontend/.env`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
