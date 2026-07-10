/**
 * LSP8DropFactory.test.ts
 *
 * Full test suite for LSP8DropFactory:
 *   - createNFTDrop() — deploys LSP8ClaimableNFT, stores campaign, emits event
 *   - totalNFTCampaigns()
 *   - getNFTCampaignsByCreator()
 *   - getNFTCampaigns() pagination — offset, limit, boundary conditions
 *   - Multiple creators tracked independently
 *   - Deployed child contracts have correct owner and initial state
 *
 * Note: this factory was split from the unified TokenClaimerFactory to keep
 * each factory's runtime bytecode under the 24 576-byte EIP-170 limit.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type { LSP8DropFactory, LSP8ClaimableNFT } from "../typechain-types";

const LSP26_REGISTRY = "0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA";

// ── Helpers ────────────────────────────────────────────────────────────────

async function deployFactory(): Promise<LSP8DropFactory> {
  const Factory = await ethers.getContractFactory("LSP8DropFactory");
  return (await Factory.deploy(LSP26_REGISTRY)) as LSP8DropFactory;
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe("LSP8DropFactory", function () {
  let factory: LSP8DropFactory;
  let creator1: SignerWithAddress;
  let creator2: SignerWithAddress;

  beforeEach(async function () {
    [creator1, creator2] = await ethers.getSigners();
    factory = await deployFactory();
  });

  // ── 1. Initial state ─────────────────────────────────────────────────────

  describe("Initial state", function () {
    it("totalNFTCampaigns() starts at 0", async function () {
      expect(await factory.totalNFTCampaigns()).to.equal(0n);
    });

    it("getNFTCampaignsByCreator() returns empty array for unknown address", async function () {
      expect(await factory.getNFTCampaignsByCreator(creator1.address)).to.deep.equal([]);
    });
  });

  // ── 2. createNFTDrop ─────────────────────────────────────────────────────

  describe("createNFTDrop()", function () {
    it("returns a non-zero contract address", async function () {
      const addr = await factory
        .connect(creator1)
        .createNFTDrop.staticCall("My NFT", "MNFT", 100n, 1n);
      expect(addr).to.not.equal(ethers.ZeroAddress);
    });

    it("increments totalNFTCampaigns() to 1", async function () {
      await factory.connect(creator1).createNFTDrop("N", "N", 100n, 1n);
      expect(await factory.totalNFTCampaigns()).to.equal(1n);
    });

    it("emits NFTCampaignCreated with correct fields", async function () {
      const addr = await factory
        .connect(creator1)
        .createNFTDrop.staticCall("My NFT", "MNFT", 100n, 1n);

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
      expect(campaign.contractAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("adds campaign index 0 to getNFTCampaignsByCreator()", async function () {
      await factory.connect(creator1).createNFTDrop("N", "N", 0n, 1n);
      const ids = await factory.getNFTCampaignsByCreator(creator1.address);
      expect(ids.map((n) => n.toString())).to.deep.equal(["0"]);
    });

    it("deployed LSP8 NFT has creator as owner", async function () {
      await factory.connect(creator1).createNFTDrop("N", "N", 0n, 1n);
      const { contractAddr } = await factory.nftCampaigns(0);
      const nft = (await ethers.getContractAt(
        "LSP8ClaimableNFT",
        contractAddr
      )) as LSP8ClaimableNFT;
      expect(await nft.owner()).to.equal(creator1.address);
    });

    it("deployed LSP8 NFT has correct maxSupply", async function () {
      await factory.connect(creator1).createNFTDrop("N", "N", 77n, 1n);
      const { contractAddr } = await factory.nftCampaigns(0);
      const nft = (await ethers.getContractAt("LSP8ClaimableNFT", contractAddr)) as LSP8ClaimableNFT;
      expect(await nft.maxSupply()).to.equal(77n);
    });

    it("deployed LSP8 NFT has correct amountPerClaim", async function () {
      await factory.connect(creator1).createNFTDrop("N", "N", 0n, 5n);
      const { contractAddr } = await factory.nftCampaigns(0);
      const nft = (await ethers.getContractAt("LSP8ClaimableNFT", contractAddr)) as LSP8ClaimableNFT;
      expect(await nft.amountPerClaim()).to.equal(5n);
    });

    it("deployed LSP8 NFT has claiming disabled by default", async function () {
      await factory.connect(creator1).createNFTDrop("N", "N", 0n, 1n);
      const { contractAddr } = await factory.nftCampaigns(0);
      const nft = (await ethers.getContractAt("LSP8ClaimableNFT", contractAddr)) as LSP8ClaimableNFT;
      expect(await nft.claimEnabled()).to.be.false;
    });

    it("deployed LSP8 NFT defaults amountPerClaim to 1 when 0 passed", async function () {
      await factory.connect(creator1).createNFTDrop("N", "N", 0n, 0n);
      const { contractAddr } = await factory.nftCampaigns(0);
      const nft = (await ethers.getContractAt("LSP8ClaimableNFT", contractAddr)) as LSP8ClaimableNFT;
      expect(await nft.amountPerClaim()).to.equal(1n);
    });

    it("nextTokenId starts at 1 on deployed NFT", async function () {
      await factory.connect(creator1).createNFTDrop("N", "N", 0n, 1n);
      const { contractAddr } = await factory.nftCampaigns(0);
      const nft = (await ethers.getContractAt("LSP8ClaimableNFT", contractAddr)) as LSP8ClaimableNFT;
      expect(await nft.nextTokenId()).to.equal(1n);
    });

    it("reverts when amountPerClaim_ > 50", async function () {
      await expect(
        factory.connect(creator1).createNFTDrop("N", "N", 0n, 51n)
      ).to.be.revertedWith("Max 50 per claim");
    });

    it("reverts when maxSupply < amountPerClaim", async function () {
      await expect(
        factory.connect(creator1).createNFTDrop("N", "N", 2n, 5n)
      ).to.be.revertedWith("maxSupply < amountPerClaim");
    });
  });

  // ── 3. Multiple creators ─────────────────────────────────────────────────

  describe("Multiple creators", function () {
    it("tracks NFT campaigns per creator independently", async function () {
      await factory.connect(creator2).createNFTDrop("X", "X", 0n, 1n); // id=0
      await factory.connect(creator1).createNFTDrop("Y", "Y", 0n, 1n); // id=1
      await factory.connect(creator2).createNFTDrop("Z", "Z", 0n, 1n); // id=2

      const ids1 = await factory.getNFTCampaignsByCreator(creator1.address);
      const ids2 = await factory.getNFTCampaignsByCreator(creator2.address);

      expect(ids1.map((n) => n.toString())).to.deep.equal(["1"]);
      expect(ids2.map((n) => n.toString())).to.deep.equal(["0", "2"]);
    });

    it("creator1 campaigns don't appear in creator2's list", async function () {
      await factory.connect(creator1).createNFTDrop("A", "A", 0n, 1n);
      expect(await factory.getNFTCampaignsByCreator(creator2.address)).to.deep.equal([]);
    });
  });

  // ── 4. getNFTCampaigns() pagination ──────────────────────────────────────

  describe("getNFTCampaigns() pagination", function () {
    beforeEach(async function () {
      for (let i = 0; i < 4; i++) {
        await factory.connect(creator1).createNFTDrop(`NFT${i}`, `N${i}`, 0n, 1n);
      }
    });

    it("returns all 4 with offset=0, limit=10", async function () {
      expect((await factory.getNFTCampaigns(0n, 10n)).length).to.equal(4);
    });

    it("paginates correctly with offset=1, limit=2", async function () {
      const slice = await factory.getNFTCampaigns(1n, 2n);
      expect(slice.length).to.equal(2);
      expect(slice[0].name).to.equal("NFT1");
      expect(slice[1].name).to.equal("NFT2");
    });

    it("returns remainder when limit overshoots", async function () {
      expect((await factory.getNFTCampaigns(3n, 10n)).length).to.equal(1); // 4 - 3
    });

    it("returns empty array when offset >= total", async function () {
      expect((await factory.getNFTCampaigns(4n, 10n)).length).to.equal(0);
    });

    it("returns empty array on fresh factory", async function () {
      const fresh = await deployFactory();
      expect((await fresh.getNFTCampaigns(0n, 10n)).length).to.equal(0);
    });

    it("preserves insertion order", async function () {
      const campaigns = await factory.getNFTCampaigns(0n, 4n);
      for (let i = 0; i < 4; i++) {
        expect(campaigns[i].name).to.equal(`NFT${i}`);
      }
    });
  });

  // ── 5. Bytecode size ─────────────────────────────────────────────────────

  describe("Contract size", function () {
    it("deploys without allowUnlimitedContractSize (runtime < 24576 bytes)", async function () {
      expect(await factory.totalNFTCampaigns()).to.equal(0n);
    });
  });
});
