import { ethers } from "hardhat";

async function main() {
  const type = process.env.TOKEN_TYPE || "LSP8"; // "LSP7" or "LSP8"
  const name = process.env.NFT_NAME || "Livestream Drop";
  const symbol = process.env.NFT_SYMBOL || "DROP";
  const maxSupply = BigInt(process.env.MAX_SUPPLY || "0");
  const amountPerClaim = BigInt(process.env.AMOUNT_PER_CLAIM || "1");
  const isNonDivisible = process.env.IS_NON_DIVISIBLE === "true";
  const lsp26Registry =
    process.env.LSP26_REGISTRY ?? "0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA";

  if (!ethers.isAddress(lsp26Registry) || lsp26Registry === ethers.ZeroAddress) {
    throw new Error("LSP26_REGISTRY must be a non-zero address");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log(`Type: ${type}`);
  console.log(`LSP26 registry: ${lsp26Registry}\n`);

  if (type === "LSP7") {
    const Factory = await ethers.getContractFactory("LSP7DropFactory");
    const factory = await Factory.deploy(lsp26Registry);
    await factory.waitForDeployment();

    const tx = await factory.createTokenDrop(
      name,
      symbol,
      amountPerClaim,
      maxSupply,
      isNonDivisible
    );
    const receipt = await tx.wait();
    const event = receipt?.logs
      .map((log) => {
        try {
          return factory.interface.parseLog({ topics: log.topics as string[], data: log.data });
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === (isNonDivisible ? "NFTCampaignCreated" : "TokenCampaignCreated"));

    const addr = event?.args.contractAddr as string | undefined;
    if (!addr) throw new Error("Could not find deployed LSP7 drop address in factory event");

    console.log(`✅ LSP7DropFactory deployed: ${await factory.getAddress()}`);
    console.log(`✅ LSP7ClaimableToken proxy deployed: ${addr}`);
    console.log(`   Amount per claim: ${amountPerClaim}`);
    console.log(`   Non-divisible: ${isNonDivisible}`);
  } else {
    const Factory = await ethers.getContractFactory("LSP8ClaimableNFT");
    const nft = await Factory.deploy(name, symbol, deployer.address, maxSupply, amountPerClaim, lsp26Registry);
    await nft.waitForDeployment();
    const addr = await nft.getAddress();
    console.log(`✅ LSP8ClaimableNFT deployed: ${addr}`);
    console.log(`   NFTs per claim: ${amountPerClaim}`);
  }

  console.log(`   Name: ${name}`);
  console.log(`   Symbol: ${symbol}`);
  console.log(`   Max Supply: ${maxSupply === 0n ? "Unlimited" : maxSupply}`);
  console.log(`   Owner: ${deployer.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
