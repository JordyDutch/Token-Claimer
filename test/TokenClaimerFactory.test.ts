/**
 * TokenClaimerFactory.test.ts
 *
 * Full test suite for TokenClaimerFactory:
 *   - createTokenDrop() — deploys LSP7ClaimableToken, stores campaign, emits event
 *   - createNFTDrop()   — deploys LSP8ClaimableNFT,   stores campaign, emits event
 *   - totalCampaigns() / totalNFTCampaigns()
 *   - getCampaignsByCreator() / getNFTCampaignsByCreator()
 *   - getCampaigns() pagination  — offset, limit, out-of-bounds
 *   - getNFTCampaigns() pagination
 *   - Multiple creators tracked independently
 *   - Deployed child contracts have correct owner and initial state
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  TokenClaimerFactory,
  LSP7ClaimableToken,
  LSP8ClaimableNFT,
} from "../typechain-types";

// ── Helpers ────────────────────────────────────────────────────────────────

const AMOUNT_PER_CLAIM = ethers.parseEther("10");

async function deployFactory(): Promise<TokenClaimerFactory> {
  const Factory = await ethers.getContractFactory("TokenClaimerFactory");
  return (await Factory.deploy()) as TokenClaimerFactory;
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe("TokenClaimerFactory", function () {
  let factory: TokenClaimerFactory;
  let creator1: SignerWithAddress;
  let creator2: SignerWithAddress;

  beforeEach(async function () {
    [creator1, creator2] = await ethers.getSigners();
    factory = await deployFactory();
  });

  // ── 1. Initial state ─────────────────────────────────────────────────────

  describe("Initial state", function () {
    it("totalCampaigns() starts at 0", async function () {
      expect(await factory.totalCampaigns()).to.equal(0n);
    });

    it("totalNFTCampaigns() starts at 0", async function () {
      expect(await factory.totalNFTCampaigns()).to.equal(0n);
    });

    it("getCampaignsByCreator() returns empty array for unknown address", async function () {
      const ids = await factory.getCampaignsByCreator(creator1.address);
      expect(ids).to.deep.equal([]);
    });

    it("getNFTCampaignsByCreator() returns empty array for unknown address", async function () {
      const ids = await factory.getNFTCampaignsByCreator(creator1.address);
      expect(ids).to.deep.equal([]);
    });
  });

  // ── 2. createTokenDrop ───────────────────────────────────────────────────

  describe("createTokenDrop()", function () {
    it("returns a non-zero contract address", async function () {
      const addr = await factory.connect(creator1).createTokenDrop.staticCall(
        "My Token", "MTK", AMOUNT_PER_CLAIM, 0n, false
      );
      expect(addr).to.not.equal(ethers.ZeroAddress);
    });

    it("increments totalCampaigns() to 1", async function () {
      await factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, 0n, false);
      expect(await factory.totalCampaigns()).to.equal(1n);
    });

    it("does not affect totalNFTCampaigns()", async function () {
      await factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, 0n, false);
      expect(await factory.totalNFTCampaigns()).to.equal(0n);
    });

    it("emits TokenCampaignCreated with correct fields", async function () {
      const tx = await factory.connect(creator1).createTokenDrop(
        "My Token", "MTK", AMOUNT_PER_CLAIM, 0n, false
      );
      const receipt = await tx.wait();

      // Get the deployed address from the return value via a static call
      const addr = await factory.connect(creator1).createTokenDrop.staticCall(
        "My Token", "MTK", AMOUNT_PER_CLAIM, 0n, false
      );

      await expect(
        factory.connect(creator1).createTokenDrop("My Token", "MTK", AMOUNT_PER_CLAIM, 0n, false)
      )
        .to.emit(factory, "TokenCampaignCreated")
        .withArgs(1n, creator1.address, addr, "My Token", "MTK");
      // id=1 because we already deployed one above (id=0 was first)
    });

    it("stores campaign with correct fields (contractAddr, creator, name, symbol, createdAt)", async function () {
      const tx = await factory.connect(creator1).createTokenDrop(
        "Cool Drop", "COOL", AMOUNT_PER_CLAIM, 0n, false
      );
      const block = await ethers.provider.getBlock(tx.blockNumber!);

      const campaign = await factory.tokenCampaigns(0);
      expect(campaign.creator).to.equal(creator1.address);
      expect(campaign.name).to.equal("Cool Drop");
      expect(campaign.symbol).to.equal("COOL");
      expect(campaign.createdAt).to.equal(BigInt(block!.timestamp));
      expect(campaign.contractAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("adds campaign index to getCampaignsByCreator()", async function () {
      await factory.connect(creator1).createTokenDrop("A", "A", AMOUNT_PER_CLAIM, 0n, false);
      const ids = await factory.getCampaignsByCreator(creator1.address);
      expect(ids.map(n => n.toString())).to.deep.equal(["0"]);
    });

    it("deployed LSP7 token has creator as owner", async function () {
      await factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, 0n, false);
      const campaign = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt(
        "LSP7ClaimableToken",
        campaign.contractAddr
      )) as LSP7ClaimableToken;
      expect(await token.owner()).to.equal(creator1.address);
    });

    it("deployed LSP7 token has correct amountPerClaim", async function () {
      await factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, 0n, false);
      const campaign = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt(
        "LSP7ClaimableToken",
        campaign.contractAddr
      )) as LSP7ClaimableToken;
      expect(await token.amountPerClaim()).to.equal(AMOUNT_PER_CLAIM);
    });

    it("deployed LSP7 token has claiming disabled by default", async function () {
      await factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, 0n, false);
      const campaign = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt(
        "LSP7ClaimableToken",
        campaign.contractAddr
      )) as LSP7ClaimableToken;
      expect(await token.claimEnabled()).to.be.false;
    });

    it("deployed token uses 18 decimals when isNonDivisible_=false", async function () {
      await factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, 0n, false);
      const campaign = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt("LSP7ClaimableToken", campaign.contractAddr)) as LSP7ClaimableToken;
      expect(await token.decimals()).to.equal(18n);
    });

    it("deployed token uses 0 decimals when isNonDivisible_=true", async function () {
      await factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, 0n, true);
      const campaign = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt("LSP7ClaimableToken", campaign.contractAddr)) as LSP7ClaimableToken;
      expect(await token.decimals()).to.equal(0n);
    });
  });

  // ── 3. createNFTDrop ─────────────────────────────────────────────────────

  describe("createNFTDrop()", function () {
    it("returns a non-zero contract address", async function () {
      const addr = await factory.connect(creator1).createNFTDrop.staticCall(
        "My NFT", "MNFT", 100n, 1n
      );
      expect(addr).to.not.equal(ethers.ZeroAddress);
    });

    it("increments totalNFTCampaigns() to 1", async function () {
      await factory.connect(creator1).createNFTDrop("N", "N", 100n, 1n);
      expect(await factory.totalNFTCampaigns()).to.equal(1n);
    });

    it("does not affect totalCampaigns()", async function () {
      await factory.connect(creator1).createNFTDrop("N", "N", 100n, 1n);
      expect(await factory.totalCampaigns()).to.equal(0n);
    });

    it("emits NFTCampaignCreated with correct fields", async function () {
      const addr = await factory.connect(creator1).createNFTDrop.staticCall(
        "My NFT", "MNFT", 100n, 1n
      );
      await expect(
        factory.connect(creator1).createNFTDrop("My NFT", "MNFT", 100n, 1n)
      )
        .to.emit(factory, "NFTCampaignCreated")
        .withArgs(0n, creator1.address, addr, "My NFT", "MNFT");
    });

    it("stores campaign with correct fields", async function () {
      const tx = await factory.connect(creator1).createNFTDrop("Art Drop", "ART", 50n, 2n);
      const block = await ethers.provider.getBlock(tx.blockNumber!);
      const campaign = await factory.nftCampaigns(0);
      expect(campaign.creator).to.equal(creator1.address);
      expect(campaign.name).to.equal("Art Drop");
      expect(campaign.symbol).to.equal("ART");
      expect(campaign.createdAt).to.equal(BigInt(block!.timestamp));
    });

    it("adds campaign index to getNFTCampaignsByCreator()", async function () {
      await factory.connect(creator1).createNFTDrop("N", "N", 0n, 1n);
      const ids = await factory.getNFTCampaignsByCreator(creator1.address);
      expect(ids.map(n => n.toString())).to.deep.equal(["0"]);
    });

    it("deployed LSP8 NFT has creator as owner", async function () {
      await factory.connect(creator1).createNFTDrop("N", "N", 0n, 1n);
      const campaign = await factory.nftCampaigns(0);
      const nft = (await ethers.getContractAt(
        "LSP8ClaimableNFT",
        campaign.contractAddr
      )) as LSP8ClaimableNFT;
      expect(await nft.owner()).to.equal(creator1.address);
    });

    it("deployed LSP8 NFT has correct maxSupply", async function () {
      await factory.connect(creator1).createNFTDrop("N", "N", 77n, 1n);
      const campaign = await factory.nftCampaigns(0);
      const nft = (await ethers.getContractAt("LSP8ClaimableNFT", campaign.contractAddr)) as LSP8ClaimableNFT;
      expect(await nft.maxSupply()).to.equal(77n);
    });

    it("deployed LSP8 NFT has correct amountPerClaim", async function () {
      await factory.connect(creator1).createNFTDrop("N", "N", 0n, 5n);
      const campaign = await factory.nftCampaigns(0);
      const nft = (await ethers.getContractAt("LSP8ClaimableNFT", campaign.contractAddr)) as LSP8ClaimableNFT;
      expect(await nft.amountPerClaim()).to.equal(5n);
    });

    it("deployed LSP8 NFT has claiming disabled by default", async function () {
      await factory.connect(creator1).createNFTDrop("N", "N", 0n, 1n);
      const campaign = await factory.nftCampaigns(0);
      const nft = (await ethers.getContractAt("LSP8ClaimableNFT", campaign.contractAddr)) as LSP8ClaimableNFT;
      expect(await nft.claimEnabled()).to.be.false;
    });
  });

  // ── 4. Multiple creators ─────────────────────────────────────────────────

  describe("Multiple creators", function () {
    it("tracks separate token campaigns per creator", async function () {
      await factory.connect(creator1).createTokenDrop("A", "A", 1n, 0n, false); // id=0
      await factory.connect(creator2).createTokenDrop("B", "B", 1n, 0n, false); // id=1
      await factory.connect(creator1).createTokenDrop("C", "C", 1n, 0n, false); // id=2

      const ids1 = await factory.getCampaignsByCreator(creator1.address);
      const ids2 = await factory.getCampaignsByCreator(creator2.address);

      expect(ids1.map(n => n.toString())).to.deep.equal(["0", "2"]);
      expect(ids2.map(n => n.toString())).to.deep.equal(["1"]);
    });

    it("tracks separate NFT campaigns per creator", async function () {
      await factory.connect(creator2).createNFTDrop("X", "X", 0n, 1n); // id=0
      await factory.connect(creator1).createNFTDrop("Y", "Y", 0n, 1n); // id=1

      const ids1 = await factory.getNFTCampaignsByCreator(creator1.address);
      const ids2 = await factory.getNFTCampaignsByCreator(creator2.address);

      expect(ids1.map(n => n.toString())).to.deep.equal(["1"]);
      expect(ids2.map(n => n.toString())).to.deep.equal(["0"]);
    });

    it("token and NFT campaign counters are independent", async function () {
      await factory.connect(creator1).createTokenDrop("T", "T", 1n, 0n, false);
      await factory.connect(creator1).createNFTDrop("N", "N", 0n, 1n);
      expect(await factory.totalCampaigns()).to.equal(1n);
      expect(await factory.totalNFTCampaigns()).to.equal(1n);
    });
  });

  // ── 5. getCampaigns() pagination ─────────────────────────────────────────

  describe("getCampaigns() pagination", function () {
    beforeEach(async function () {
      // Deploy 5 token campaigns
      for (let i = 0; i < 5; i++) {
        await factory.connect(creator1).createTokenDrop(`Token${i}`, `T${i}`, 1n, 0n, false);
      }
    });

    it("returns all 5 campaigns with offset=0, limit=10", async function () {
      const campaigns = await factory.getCampaigns(0n, 10n);
      expect(campaigns.length).to.equal(5);
    });

    it("returns exactly limit campaigns when limit < total", async function () {
      const campaigns = await factory.getCampaigns(0n, 3n);
      expect(campaigns.length).to.equal(3);
    });

    it("returns remaining campaigns when offset > 0", async function () {
      const campaigns = await factory.getCampaigns(2n, 10n);
      expect(campaigns.length).to.equal(3); // 5 - 2 = 3
    });

    it("returns correct campaigns for offset=2, limit=2", async function () {
      const campaigns = await factory.getCampaigns(2n, 2n);
      expect(campaigns.length).to.equal(2);
      expect(campaigns[0].name).to.equal("Token2");
      expect(campaigns[1].name).to.equal("Token3");
    });

    it("returns empty array when offset >= total", async function () {
      const campaigns = await factory.getCampaigns(5n, 10n);
      expect(campaigns.length).to.equal(0);
    });

    it("returns empty array when total is 0", async function () {
      const freshFactory = await deployFactory();
      const campaigns = await freshFactory.getCampaigns(0n, 10n);
      expect(campaigns.length).to.equal(0);
    });

    it("each campaign has correct name in order", async function () {
      const campaigns = await factory.getCampaigns(0n, 5n);
      for (let i = 0; i < 5; i++) {
        expect(campaigns[i].name).to.equal(`Token${i}`);
      }
    });
  });

  // ── 6. getNFTCampaigns() pagination ──────────────────────────────────────

  describe("getNFTCampaigns() pagination", function () {
    beforeEach(async function () {
      for (let i = 0; i < 4; i++) {
        await factory.connect(creator1).createNFTDrop(`NFT${i}`, `N${i}`, 0n, 1n);
      }
    });

    it("returns all 4 campaigns with offset=0, limit=10", async function () {
      const campaigns = await factory.getNFTCampaigns(0n, 10n);
      expect(campaigns.length).to.equal(4);
    });

    it("paginates correctly with offset=1, limit=2", async function () {
      const campaigns = await factory.getNFTCampaigns(1n, 2n);
      expect(campaigns.length).to.equal(2);
      expect(campaigns[0].name).to.equal("NFT1");
      expect(campaigns[1].name).to.equal("NFT2");
    });

    it("returns empty array when offset >= total", async function () {
      const campaigns = await factory.getNFTCampaigns(4n, 10n);
      expect(campaigns.length).to.equal(0);
    });

    it("returns empty array for fresh factory", async function () {
      const freshFactory = await deployFactory();
      const campaigns = await freshFactory.getNFTCampaigns(0n, 10n);
      expect(campaigns.length).to.equal(0);
    });
  });
});
