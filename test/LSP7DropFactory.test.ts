/**
 * LSP7DropFactory.test.ts
 *
 * Full test suite for LSP7DropFactory:
 *   - createTokenDrop() — deploys LSP7ClaimableToken, stores campaign, emits event
 *   - totalCampaigns()
 *   - getCampaignsByCreator()
 *   - getCampaigns() pagination — offset, limit, boundary conditions
 *   - Multiple creators tracked independently
 *   - Deployed child contracts have correct owner and initial state
 *
 * Note: this factory was split from the unified TokenClaimerFactory to keep
 * each factory's runtime bytecode under the 24 576-byte EIP-170 limit.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type { LSP7DropFactory, LSP7ClaimableToken } from "../typechain-types";

// ── Helpers ────────────────────────────────────────────────────────────────

const AMOUNT_PER_CLAIM = ethers.parseEther("10");

async function deployFactory(): Promise<LSP7DropFactory> {
  const Factory = await ethers.getContractFactory("LSP7DropFactory");
  return (await Factory.deploy()) as LSP7DropFactory;
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe("LSP7DropFactory", function () {
  let factory: LSP7DropFactory;
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

    it("getCampaignsByCreator() returns empty array for unknown address", async function () {
      expect(await factory.getCampaignsByCreator(creator1.address)).to.deep.equal([]);
    });
  });

  // ── 2. createTokenDrop ───────────────────────────────────────────────────

  describe("createTokenDrop()", function () {
    it("returns a non-zero contract address", async function () {
      const addr = await factory
        .connect(creator1)
        .createTokenDrop.staticCall("T", "T", AMOUNT_PER_CLAIM, 0n, false);
      expect(addr).to.not.equal(ethers.ZeroAddress);
    });

    it("increments totalCampaigns() to 1", async function () {
      await factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, 0n, false);
      expect(await factory.totalCampaigns()).to.equal(1n);
    });

    it("emits TokenCampaignCreated with correct fields", async function () {
      const addr = await factory
        .connect(creator1)
        .createTokenDrop.staticCall("My Token", "MTK", AMOUNT_PER_CLAIM, 0n, false);

      await expect(
        factory.connect(creator1).createTokenDrop("My Token", "MTK", AMOUNT_PER_CLAIM, 0n, false)
      )
        .to.emit(factory, "TokenCampaignCreated")
        .withArgs(0n, creator1.address, addr, "My Token", "MTK");
    });

    it("stores campaign with correct fields", async function () {
      const tx = await factory
        .connect(creator1)
        .createTokenDrop("Cool Drop", "COOL", AMOUNT_PER_CLAIM, 0n, false);
      const block = await ethers.provider.getBlock(tx.blockNumber!);

      const campaign = await factory.tokenCampaigns(0);
      expect(campaign.creator).to.equal(creator1.address);
      expect(campaign.name).to.equal("Cool Drop");
      expect(campaign.symbol).to.equal("COOL");
      expect(campaign.createdAt).to.equal(BigInt(block!.timestamp));
      expect(campaign.contractAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("adds campaign index 0 to getCampaignsByCreator()", async function () {
      await factory.connect(creator1).createTokenDrop("A", "A", AMOUNT_PER_CLAIM, 0n, false);
      const ids = await factory.getCampaignsByCreator(creator1.address);
      expect(ids.map((n) => n.toString())).to.deep.equal(["0"]);
    });

    it("deployed LSP7 token has creator as owner", async function () {
      await factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, 0n, false);
      const { contractAddr } = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt(
        "LSP7ClaimableToken",
        contractAddr
      )) as LSP7ClaimableToken;
      expect(await token.owner()).to.equal(creator1.address);
    });

    it("deployed LSP7 token has correct amountPerClaim", async function () {
      await factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, 0n, false);
      const { contractAddr } = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt(
        "LSP7ClaimableToken",
        contractAddr
      )) as LSP7ClaimableToken;
      expect(await token.amountPerClaim()).to.equal(AMOUNT_PER_CLAIM);
    });

    it("deployed LSP7 token has claiming disabled by default", async function () {
      await factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, 0n, false);
      const { contractAddr } = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt(
        "LSP7ClaimableToken",
        contractAddr
      )) as LSP7ClaimableToken;
      expect(await token.claimEnabled()).to.be.false;
    });

    it("deployed token uses 18 decimals when isNonDivisible_=false", async function () {
      await factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, 0n, false);
      const { contractAddr } = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt("LSP7ClaimableToken", contractAddr)) as LSP7ClaimableToken;
      expect(await token.decimals()).to.equal(18n);
    });

    it("deployed token uses 0 decimals when isNonDivisible_=true", async function () {
      await factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, 0n, true);
      const { contractAddr } = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt("LSP7ClaimableToken", contractAddr)) as LSP7ClaimableToken;
      expect(await token.decimals()).to.equal(0n);
    });

    it("deployed token has correct maxSupply", async function () {
      const supply = AMOUNT_PER_CLAIM * 5n; // 5 claims worth
      await factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, supply, false);
      const { contractAddr } = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt("LSP7ClaimableToken", contractAddr)) as LSP7ClaimableToken;
      expect(await token.maxSupply()).to.equal(supply);
    });

    it("reverts when maxSupply < amountPerClaim", async function () {
      await expect(
        factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, 1n, false)
      ).to.be.revertedWith("maxSupply < amountPerClaim");
    });
  });

  // ── 3. Multiple creators ─────────────────────────────────────────────────

  describe("Multiple creators", function () {
    it("tracks campaigns per creator independently", async function () {
      await factory.connect(creator1).createTokenDrop("A", "A", 1n, 0n, false); // id=0
      await factory.connect(creator2).createTokenDrop("B", "B", 1n, 0n, false); // id=1
      await factory.connect(creator1).createTokenDrop("C", "C", 1n, 0n, false); // id=2

      const ids1 = await factory.getCampaignsByCreator(creator1.address);
      const ids2 = await factory.getCampaignsByCreator(creator2.address);

      expect(ids1.map((n) => n.toString())).to.deep.equal(["0", "2"]);
      expect(ids2.map((n) => n.toString())).to.deep.equal(["1"]);
    });

    it("creator2 campaigns don't appear in creator1's list", async function () {
      await factory.connect(creator2).createTokenDrop("X", "X", 1n, 0n, false);
      expect(await factory.getCampaignsByCreator(creator1.address)).to.deep.equal([]);
    });
  });

  // ── 4. getCampaigns() pagination ─────────────────────────────────────────

  describe("getCampaigns() pagination", function () {
    beforeEach(async function () {
      for (let i = 0; i < 5; i++) {
        await factory
          .connect(creator1)
          .createTokenDrop(`Token${i}`, `T${i}`, 1n, 0n, false);
      }
    });

    it("returns all 5 with offset=0, limit=10", async function () {
      expect((await factory.getCampaigns(0n, 10n)).length).to.equal(5);
    });

    it("returns exactly limit items when limit < total", async function () {
      expect((await factory.getCampaigns(0n, 3n)).length).to.equal(3);
    });

    it("returns remainder when offset > 0", async function () {
      expect((await factory.getCampaigns(2n, 10n)).length).to.equal(3); // 5 - 2
    });

    it("returns correct slice for offset=2, limit=2", async function () {
      const slice = await factory.getCampaigns(2n, 2n);
      expect(slice.length).to.equal(2);
      expect(slice[0].name).to.equal("Token2");
      expect(slice[1].name).to.equal("Token3");
    });

    it("returns empty array when offset >= total", async function () {
      expect((await factory.getCampaigns(5n, 10n)).length).to.equal(0);
    });

    it("returns empty array on fresh factory", async function () {
      const fresh = await deployFactory();
      expect((await fresh.getCampaigns(0n, 10n)).length).to.equal(0);
    });

    it("preserves insertion order", async function () {
      const campaigns = await factory.getCampaigns(0n, 5n);
      for (let i = 0; i < 5; i++) {
        expect(campaigns[i].name).to.equal(`Token${i}`);
      }
    });
  });

  // ── 5. createNFTDrop (LSP7 non-divisible) ──────────────────────────────

  describe("createNFTDrop() — LSP7 non-divisible", function () {
    it("returns a non-zero contract address", async function () {
      const addr = await factory
        .connect(creator1)
        .createNFTDrop.staticCall("NFT", "NFT", 100n, 1n);
      expect(addr).to.not.equal(ethers.ZeroAddress);
    });

    it("increments totalCampaigns() to 1", async function () {
      await factory.connect(creator1).createNFTDrop("NFT", "NFT", 100n, 1n);
      expect(await factory.totalCampaigns()).to.equal(1n);
    });

    it("increments totalNFTCampaigns() to 1", async function () {
      await factory.connect(creator1).createNFTDrop("NFT", "NFT", 100n, 1n);
      expect(await factory.totalNFTCampaigns()).to.equal(1n);
    });

    it("emits NFTCampaignCreated with correct fields", async function () {
      const addr = await factory
        .connect(creator1)
        .createNFTDrop.staticCall("My NFT", "MNFT", 0n, 1n);

      await expect(
        factory.connect(creator1).createNFTDrop("My NFT", "MNFT", 0n, 1n)
      )
        .to.emit(factory, "NFTCampaignCreated")
        .withArgs(0n, creator1.address, addr, "My NFT", "MNFT");
    });

    it("stores campaign with isNonDivisible=true", async function () {
      await factory.connect(creator1).createNFTDrop("NFT Drop", "NFTD", 100n, 2n);
      const campaign = await factory.tokenCampaigns(0);
      expect(campaign.isNonDivisible).to.be.true;
      expect(campaign.name).to.equal("NFT Drop");
    });

    it("deployed token has 0 decimals", async function () {
      await factory.connect(creator1).createNFTDrop("NFT", "NFT", 100n, 1n);
      const { contractAddr } = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt(
        "LSP7ClaimableToken",
        contractAddr
      )) as LSP7ClaimableToken;
      expect(await token.decimals()).to.equal(0n);
    });

    it("deployed token has creator as owner", async function () {
      await factory.connect(creator1).createNFTDrop("NFT", "NFT", 0n, 1n);
      const { contractAddr } = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt(
        "LSP7ClaimableToken",
        contractAddr
      )) as LSP7ClaimableToken;
      expect(await token.owner()).to.equal(creator1.address);
    });

    it("deployed token has correct maxSupply and amountPerClaim", async function () {
      await factory.connect(creator1).createNFTDrop("NFT", "NFT", 50n, 5n);
      const { contractAddr } = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt(
        "LSP7ClaimableToken",
        contractAddr
      )) as LSP7ClaimableToken;
      expect(await token.maxSupply()).to.equal(50n);
      expect(await token.amountPerClaim()).to.equal(5n);
    });

    it("claiming works on non-divisible token", async function () {
      await factory.connect(creator1).createNFTDrop("NFT", "NFT", 100n, 3n);
      const { contractAddr } = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt(
        "LSP7ClaimableToken",
        contractAddr
      )) as LSP7ClaimableToken;

      // Deploy a mock LSP1 account (LSP7 requires a UP, not an EOA)
      const MockAccountFactory = await ethers.getContractFactory("MockLSP1Account");
      const claimer = await MockAccountFactory.deploy();
      const claimerAddr = await claimer.getAddress();

      // Enable claims
      await token.connect(creator1).setClaimEnabled(true);

      // Mock account claims via the IClaimable interface
      await claimer.doClaim(contractAddr);
      expect(await token.hasClaimed(claimerAddr)).to.be.true;
      expect(await token.balanceOf(claimerAddr)).to.equal(3n);
      expect(await token.totalClaimedAmount()).to.equal(3n);
    });

    it("reverts when maxSupply < amountPerClaim", async function () {
      await expect(
        factory.connect(creator1).createNFTDrop("NFT", "NFT", 1n, 5n)
      ).to.be.revertedWith("maxSupply < amountPerClaim");
    });
  });

  // ── 6. getNFTCampaigns() view ─────────────────────────────────────────

  describe("getNFTCampaigns() filtering", function () {
    it("only returns non-divisible campaigns", async function () {
      await factory.connect(creator1).createTokenDrop("Token", "TKN", 1n, 0n, false); // id=0 divisible
      await factory.connect(creator1).createNFTDrop("NFT1", "N1", 0n, 1n);           // id=1 non-divisible
      await factory.connect(creator1).createTokenDrop("Token2", "T2", 1n, 0n, true);  // id=2 non-divisible via createTokenDrop
      await factory.connect(creator1).createNFTDrop("NFT2", "N2", 0n, 1n);           // id=3 non-divisible

      expect(await factory.totalCampaigns()).to.equal(4n);
      expect(await factory.totalNFTCampaigns()).to.equal(3n);

      const nfts = await factory.getNFTCampaigns(0n, 10n);
      expect(nfts.length).to.equal(3);
      expect(nfts[0].name).to.equal("NFT1");
      expect(nfts[1].name).to.equal("Token2"); // non-divisible via createTokenDrop
      expect(nfts[2].name).to.equal("NFT2");
    });

    it("returns empty when no NFT campaigns exist", async function () {
      await factory.connect(creator1).createTokenDrop("Token", "TKN", 1n, 0n, false);
      expect(await factory.totalNFTCampaigns()).to.equal(0n);
      expect((await factory.getNFTCampaigns(0n, 10n)).length).to.equal(0);
    });
  });

  // ── 7. Bytecode size ─────────────────────────────────────────────────────

  describe("Contract size", function () {
    it("deploys without allowUnlimitedContractSize (runtime < 24576 bytes)", async function () {
      // The factory deploys in beforeEach without the size override — if it reaches
      // this point the Hardhat network accepted it under the 24 576-byte limit.
      expect(await factory.totalCampaigns()).to.equal(0n);
    });
  });
});
