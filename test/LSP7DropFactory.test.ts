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
      await factory.connect(creator1).createTokenDrop("T", "T", AMOUNT_PER_CLAIM, 500n, false);
      const { contractAddr } = await factory.tokenCampaigns(0);
      const token = (await ethers.getContractAt("LSP7ClaimableToken", contractAddr)) as LSP7ClaimableToken;
      expect(await token.maxSupply()).to.equal(500n);
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

  // ── 5. Bytecode size ─────────────────────────────────────────────────────

  describe("Contract size", function () {
    it("deploys without allowUnlimitedContractSize (runtime < 24576 bytes)", async function () {
      // The factory deploys in beforeEach without the size override — if it reaches
      // this point the Hardhat network accepted it under the 24 576-byte limit.
      expect(await factory.totalCampaigns()).to.equal(0n);
    });
  });
});
