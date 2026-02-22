/**
 * LSP8ClaimableNFT.test.ts
 *
 * Full test suite for LSP8ClaimableNFT:
 *   - Deployment + constructor validation
 *   - Owner control functions (setClaimEnabled, setClaimWindow, setAmountPerClaim,
 *     setRequirements, rescueLYX)
 *   - claim() — happy path, partial claims, all revert paths
 *   - isClaimActive() including the "supply exhausted" edge case
 *   - totalClaimed() / nextTokenId() views
 *   - meetsRequirements() / batchMeetsRequirements() views
 *   - getTokenRequirements() view
 *   - Multi-token requirements (2+ tokens required, partial fail, all pass)
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  LSP8ClaimableNFT,
  MockLSP1Account,
  MockToken,
  MockLSP26,
} from "../typechain-types";

// ── Constants ──────────────────────────────────────────────────────────────

const LSP26_REGISTRY = "0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA";

const LSP4_TOKEN_NAME_KEY =
  "0xdeba1e292f8ba88238e10ab3c7f88bd4be4fac56cad5194b6ecceaf653468af1";
const LSP4_TOKEN_SYMBOL_KEY =
  "0x2f0a68ab07768e01943a599e73362a0e17a63a72e94dd2e384d2c1d4db932756";

// ── Helpers ────────────────────────────────────────────────────────────────

async function injectMockLSP26(): Promise<MockLSP26> {
  const Factory = await ethers.getContractFactory("MockLSP26");
  const temp = await Factory.deploy();
  const code = await ethers.provider.getCode(await temp.getAddress());
  await ethers.provider.send("hardhat_setCode", [LSP26_REGISTRY, code]);
  return Factory.attach(LSP26_REGISTRY) as unknown as MockLSP26;
}

async function deployAccount(): Promise<MockLSP1Account> {
  const Factory = await ethers.getContractFactory("MockLSP1Account");
  return (await Factory.deploy()) as MockLSP1Account;
}

async function timeTravel(seconds: number): Promise<void> {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

async function now(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}

async function deployNFT(
  owner: SignerWithAddress,
  opts: { maxSupply?: bigint; amountPerClaim?: bigint } = {}
): Promise<LSP8ClaimableNFT> {
  const Factory = await ethers.getContractFactory("LSP8ClaimableNFT");
  return (await Factory.deploy(
    "Test NFT",
    "NFT",
    owner.address,
    opts.maxSupply ?? 0n,
    opts.amountPerClaim ?? 1n
  )) as LSP8ClaimableNFT;
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe("LSP8ClaimableNFT", function () {
  let nft: LSP8ClaimableNFT;
  let owner: SignerWithAddress;
  let stranger: SignerWithAddress;
  let mockLSP26: MockLSP26;
  let mockToken: MockToken;
  let mockToken2: MockToken;
  let claimer1: MockLSP1Account;
  let claimer2: MockLSP1Account;
  let claimer3: MockLSP1Account;

  beforeEach(async function () {
    [owner, stranger] = await ethers.getSigners();
    mockLSP26 = await injectMockLSP26();

    const MockTokenFactory = await ethers.getContractFactory("MockToken");
    mockToken = (await MockTokenFactory.deploy()) as MockToken;
    mockToken2 = (await MockTokenFactory.deploy()) as MockToken;

    claimer1 = await deployAccount();
    claimer2 = await deployAccount();
    claimer3 = await deployAccount();

    nft = await deployNFT(owner);
  });

  // ── 1. Deployment ────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("stores name (via LSP4 ERC725Y getData)", async function () {
      const nameBytes = await nft.getData(LSP4_TOKEN_NAME_KEY);
      expect(ethers.toUtf8String(nameBytes)).to.equal("Test NFT");
    });

    it("stores symbol (via LSP4 ERC725Y getData)", async function () {
      const symbolBytes = await nft.getData(LSP4_TOKEN_SYMBOL_KEY);
      expect(ethers.toUtf8String(symbolBytes)).to.equal("NFT");
    });

    it("sets maxSupply", async function () {
      expect(await nft.maxSupply()).to.equal(0n);
    });

    it("sets amountPerClaim", async function () {
      expect(await nft.amountPerClaim()).to.equal(1n);
    });

    it("nextTokenId starts at 1", async function () {
      expect(await nft.nextTokenId()).to.equal(1n);
    });

    it("totalClaimed() starts at 0", async function () {
      expect(await nft.totalClaimed()).to.equal(0n);
    });

    it("claimEnabled starts false", async function () {
      expect(await nft.claimEnabled()).to.be.false;
    });

    it("sets owner to the constructor argument", async function () {
      expect(await nft.owner()).to.equal(owner.address);
    });

    it("defaults amountPerClaim to 1 when 0 is passed", async function () {
      const Factory = await ethers.getContractFactory("LSP8ClaimableNFT");
      const n = (await Factory.deploy("Z", "Z", owner.address, 0n, 0n)) as LSP8ClaimableNFT;
      expect(await n.amountPerClaim()).to.equal(1n);
    });

    it("reverts when amountPerClaim_ > 50", async function () {
      const Factory = await ethers.getContractFactory("LSP8ClaimableNFT");
      await expect(Factory.deploy("Z", "Z", owner.address, 0n, 51n)).to.be.revertedWith(
        "Max 50 per claim"
      );
    });

    it("accepts amountPerClaim_ == 50", async function () {
      const Factory = await ethers.getContractFactory("LSP8ClaimableNFT");
      await expect(Factory.deploy("Z", "Z", owner.address, 0n, 50n)).to.not.be.reverted;
    });

    it("reverts when maxSupply < amountPerClaim (non-zero maxSupply)", async function () {
      const Factory = await ethers.getContractFactory("LSP8ClaimableNFT");
      await expect(Factory.deploy("Z", "Z", owner.address, 2n, 5n)).to.be.revertedWith(
        "maxSupply < amountPerClaim"
      );
    });

    it("allows maxSupply == amountPerClaim", async function () {
      const Factory = await ethers.getContractFactory("LSP8ClaimableNFT");
      await expect(Factory.deploy("Z", "Z", owner.address, 5n, 5n)).to.not.be.reverted;
    });

    it("allows maxSupply == 0 (unlimited)", async function () {
      const Factory = await ethers.getContractFactory("LSP8ClaimableNFT");
      await expect(Factory.deploy("Z", "Z", owner.address, 0n, 5n)).to.not.be.reverted;
    });

    it("starts with empty token requirements", async function () {
      const [tokens, balances] = await nft.getTokenRequirements();
      expect(tokens.length).to.equal(0);
      expect(balances.length).to.equal(0);
    });
  });

  // ── 2. receive() ─────────────────────────────────────────────────────────

  describe("receive()", function () {
    it("accepts LYX without reverting", async function () {
      await expect(
        owner.sendTransaction({ to: await nft.getAddress(), value: ethers.parseEther("1") })
      ).to.not.be.reverted;
    });
  });

  // ── 3. setClaimEnabled ───────────────────────────────────────────────────

  describe("setClaimEnabled", function () {
    it("owner can enable", async function () {
      await nft.setClaimEnabled(true);
      expect(await nft.claimEnabled()).to.be.true;
    });

    it("owner can disable", async function () {
      await nft.setClaimEnabled(true);
      await nft.setClaimEnabled(false);
      expect(await nft.claimEnabled()).to.be.false;
    });

    it("emits ClaimToggled(true)", async function () {
      await expect(nft.setClaimEnabled(true)).to.emit(nft, "ClaimToggled").withArgs(true);
    });

    it("emits ClaimToggled(false)", async function () {
      await nft.setClaimEnabled(true);
      await expect(nft.setClaimEnabled(false)).to.emit(nft, "ClaimToggled").withArgs(false);
    });

    it("reverts for non-owner", async function () {
      await expect(nft.connect(stranger).setClaimEnabled(true)).to.be.reverted;
    });
  });

  // ── 4. setClaimWindow ────────────────────────────────────────────────────

  describe("setClaimWindow", function () {
    it("sets startTime and endTime", async function () {
      const t = await now();
      await nft.setClaimWindow(t, t + 3600);
      expect(await nft.startTime()).to.equal(BigInt(t));
      expect(await nft.endTime()).to.equal(BigInt(t + 3600));
    });

    it("emits ClaimWindowSet", async function () {
      const t = await now();
      await expect(nft.setClaimWindow(t, t + 3600))
        .to.emit(nft, "ClaimWindowSet")
        .withArgs(BigInt(t), BigInt(t + 3600));
    });

    it("allows (0, 0) for unrestricted access", async function () {
      await expect(nft.setClaimWindow(0, 0)).to.not.be.reverted;
    });

    it("reverts when end < start (and end != 0)", async function () {
      const t = await now();
      await expect(nft.setClaimWindow(t + 100, t + 50)).to.be.revertedWith("Invalid window");
    });

    it("reverts when end == start (and end != 0)", async function () {
      const t = await now();
      await expect(nft.setClaimWindow(t, t)).to.be.revertedWith("Invalid window");
    });

    it("reverts for non-owner", async function () {
      const t = await now();
      await expect(nft.connect(stranger).setClaimWindow(t, t + 3600)).to.be.reverted;
    });
  });

  // ── 5. setAmountPerClaim ─────────────────────────────────────────────────

  describe("setAmountPerClaim", function () {
    it("updates amountPerClaim", async function () {
      await nft.setAmountPerClaim(5n);
      expect(await nft.amountPerClaim()).to.equal(5n);
    });

    it("emits AmountPerClaimUpdated", async function () {
      await expect(nft.setAmountPerClaim(3n)).to.emit(nft, "AmountPerClaimUpdated").withArgs(3n);
    });

    it("reverts when amount is 0", async function () {
      await expect(nft.setAmountPerClaim(0n)).to.be.revertedWith("Must be 1-50");
    });

    it("reverts when amount > 50", async function () {
      await expect(nft.setAmountPerClaim(51n)).to.be.revertedWith("Must be 1-50");
    });

    it("accepts exactly 50", async function () {
      await expect(nft.setAmountPerClaim(50n)).to.not.be.reverted;
    });

    it("reverts when amount would exceed a non-zero maxSupply", async function () {
      const limited = await deployNFT(owner, { maxSupply: 10n, amountPerClaim: 1n });
      await expect(limited.setAmountPerClaim(11n)).to.be.revertedWith("Would exceed maxSupply");
    });

    it("allows amount == maxSupply (single-claim supply)", async function () {
      const limited = await deployNFT(owner, { maxSupply: 10n, amountPerClaim: 1n });
      await expect(limited.setAmountPerClaim(10n)).to.not.be.reverted;
    });

    it("allows raising amount freely when maxSupply is unlimited (0)", async function () {
      await expect(nft.setAmountPerClaim(50n)).to.not.be.reverted;
    });

    it("reverts for non-owner", async function () {
      await expect(nft.connect(stranger).setAmountPerClaim(1n)).to.be.reverted;
    });
  });

  // ── 6. setRequirements ───────────────────────────────────────────────────

  describe("setRequirements", function () {
    it("stores single token requirement via getTokenRequirements()", async function () {
      const tokenAddr = await mockToken.getAddress();
      await nft.setRequirements([tokenAddr], [200n], 5n);
      const [tokens, balances] = await nft.getTokenRequirements();
      expect(tokens.length).to.equal(1);
      expect(tokens[0]).to.equal(tokenAddr);
      expect(balances[0]).to.equal(200n);
      expect(await nft.requiredFollowers()).to.equal(5n);
    });

    it("stores multiple token requirements", async function () {
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      await nft.setRequirements([addr1, addr2], [100n, 300n], 0n);
      const [tokens, balances] = await nft.getTokenRequirements();
      expect(tokens.length).to.equal(2);
      expect(tokens[0]).to.equal(addr1);
      expect(tokens[1]).to.equal(addr2);
      expect(balances[0]).to.equal(100n);
      expect(balances[1]).to.equal(300n);
    });

    it("emits RequirementsUpdated with tokenCount and followers", async function () {
      const tokenAddr = await mockToken.getAddress();
      await expect(nft.setRequirements([tokenAddr], [200n], 5n))
        .to.emit(nft, "RequirementsUpdated")
        .withArgs(1n, 5n);
    });

    it("can clear requirements", async function () {
      await nft.setRequirements([await mockToken.getAddress()], [200n], 5n);
      await nft.setRequirements([], [], 0n);
      const [tokens, balances] = await nft.getTokenRequirements();
      expect(tokens.length).to.equal(0);
      expect(balances.length).to.equal(0);
      expect(await nft.requiredFollowers()).to.equal(0n);
    });

    it("reverts when arrays have different lengths", async function () {
      const tokenAddr = await mockToken.getAddress();
      await expect(
        nft.setRequirements([tokenAddr], [100n, 200n], 0n)
      ).to.be.revertedWith("Length mismatch");
    });

    it("reverts when more than 10 token requirements are provided", async function () {
      const addrs = Array(11).fill(await mockToken.getAddress());
      const amounts = Array(11).fill(1n);
      await expect(nft.setRequirements(addrs, amounts, 0n)).to.be.revertedWith(
        "Max 10 token requirements"
      );
    });

    it("accepts exactly 10 token requirements", async function () {
      const addrs = Array(10).fill(await mockToken.getAddress());
      const amounts = Array(10).fill(1n);
      await expect(nft.setRequirements(addrs, amounts, 0n)).to.not.be.reverted;
    });

    it("reverts for non-owner", async function () {
      await expect(nft.connect(stranger).setRequirements([], [], 0n)).to.be.reverted;
    });
  });

  // ── 7. getTokenRequirements() ─────────────────────────────────────────────

  describe("getTokenRequirements()", function () {
    it("returns empty arrays initially", async function () {
      const [tokens, balances] = await nft.getTokenRequirements();
      expect(tokens).to.deep.equal([]);
      expect(balances).to.deep.equal([]);
    });

    it("returns correct data after setRequirements", async function () {
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      await nft.setRequirements([addr1, addr2], [111n, 222n], 0n);
      const [tokens, balances] = await nft.getTokenRequirements();
      expect(tokens[0]).to.equal(addr1);
      expect(tokens[1]).to.equal(addr2);
      expect(balances[0]).to.equal(111n);
      expect(balances[1]).to.equal(222n);
    });
  });

  // ── 8. rescueLYX ─────────────────────────────────────────────────────────

  describe("rescueLYX", function () {
    const amount = ethers.parseEther("1");

    beforeEach(async function () {
      await owner.sendTransaction({ to: await nft.getAddress(), value: amount });
    });

    it("sends LYX to recipient", async function () {
      const recipient = await claimer1.getAddress();
      const before = await ethers.provider.getBalance(recipient);
      await nft.rescueLYX(recipient as any, amount);
      expect(await ethers.provider.getBalance(recipient) - before).to.equal(amount);
    });

    it("emits LYXRescued", async function () {
      const recipient = await claimer1.getAddress();
      await expect(nft.rescueLYX(recipient as any, amount))
        .to.emit(nft, "LYXRescued")
        .withArgs(recipient, amount);
    });

    it("reverts for non-owner", async function () {
      const recipient = await claimer1.getAddress();
      await expect(nft.connect(stranger).rescueLYX(recipient as any, amount)).to.be.reverted;
    });
  });

  // ── 9. claim() — revert paths ────────────────────────────────────────────

  describe("claim() reverts", function () {
    it("ClaimNotActive when disabled", async function () {
      await expect(claimer1.doClaim(await nft.getAddress())).to.be.revertedWithCustomError(
        nft,
        "ClaimNotActive"
      );
    });

    it("AlreadyClaimed on second attempt", async function () {
      await nft.setClaimEnabled(true);
      await claimer1.doClaim(await nft.getAddress());
      await expect(claimer1.doClaim(await nft.getAddress())).to.be.revertedWithCustomError(
        nft,
        "AlreadyClaimed"
      );
    });

    it("OutsideClaimWindow before startTime", async function () {
      const t = await now();
      await nft.setClaimEnabled(true);
      await nft.setClaimWindow(t + 9999, 0);
      await expect(claimer1.doClaim(await nft.getAddress())).to.be.revertedWithCustomError(
        nft,
        "OutsideClaimWindow"
      );
    });

    it("OutsideClaimWindow after endTime", async function () {
      const t = await now();
      await nft.setClaimEnabled(true);
      await nft.setClaimWindow(0, t + 1);
      await timeTravel(5);
      await expect(claimer1.doClaim(await nft.getAddress())).to.be.revertedWithCustomError(
        nft,
        "OutsideClaimWindow"
      );
    });

    it("MaxSupplyReached when all NFTs are minted", async function () {
      nft = await deployNFT(owner, { maxSupply: 1n, amountPerClaim: 1n });
      await nft.setClaimEnabled(true);
      await claimer1.doClaim(await nft.getAddress());
      await expect(claimer2.doClaim(await nft.getAddress())).to.be.revertedWithCustomError(
        nft,
        "MaxSupplyReached"
      );
    });

    it("InsufficientTokenBalance when required token not held", async function () {
      await nft.setClaimEnabled(true);
      await nft.setRequirements([await mockToken.getAddress()], [500n], 0n);
      await expect(claimer1.doClaim(await nft.getAddress())).to.be.revertedWithCustomError(
        nft,
        "InsufficientTokenBalance"
      );
    });

    it("InsufficientFollowers when below minimum", async function () {
      await nft.setClaimEnabled(true);
      await nft.setRequirements([], [], 10n);
      await expect(claimer1.doClaim(await nft.getAddress())).to.be.revertedWithCustomError(
        nft,
        "InsufficientFollowers"
      );
    });

    it("InsufficientTokenBalance when second of two tokens not held", async function () {
      await nft.setClaimEnabled(true);
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      await nft.setRequirements([addr1, addr2], [100n, 200n], 0n);
      await mockToken.setBalance(await claimer1.getAddress(), 100n);
      // claimer1 has token1 but not token2
      await expect(claimer1.doClaim(await nft.getAddress())).to.be.revertedWithCustomError(
        nft,
        "InsufficientTokenBalance"
      );
    });
  });

  // ── 10. claim() — single NFT (amountPerClaim=1) ───────────────────────────

  describe("claim() — single NFT", function () {
    beforeEach(async function () {
      await nft.setClaimEnabled(true);
    });

    it("sets hasClaimed to true", async function () {
      const addr = await claimer1.getAddress();
      await claimer1.doClaim(await nft.getAddress());
      expect(await nft.hasClaimed(addr)).to.be.true;
    });

    it("mints token ID 1 to the claimer", async function () {
      const addr = await claimer1.getAddress();
      await claimer1.doClaim(await nft.getAddress());
      const tid = ethers.zeroPadValue(ethers.toBeHex(1n), 32);
      expect(await nft.tokenOwnerOf(tid)).to.equal(addr);
    });

    it("advances nextTokenId to 2", async function () {
      await claimer1.doClaim(await nft.getAddress());
      expect(await nft.nextTokenId()).to.equal(2n);
    });

    it("totalClaimed() == 1 after first claim", async function () {
      await claimer1.doClaim(await nft.getAddress());
      expect(await nft.totalClaimed()).to.equal(1n);
    });

    it("emits NFTsClaimed(claimer, firstId=1, amount=1)", async function () {
      const addr = await claimer1.getAddress();
      await expect(claimer1.doClaim(await nft.getAddress()))
        .to.emit(nft, "NFTsClaimed")
        .withArgs(addr, 1n, 1n);
    });

    it("works when ALL multi-token requirements are met", async function () {
      const claimerAddr = await claimer1.getAddress();
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      await nft.setRequirements([addr1, addr2], [100n, 200n], 0n);
      await mockToken.setBalance(claimerAddr, 100n);
      await mockToken2.setBalance(claimerAddr, 200n);
      await expect(claimer1.doClaim(await nft.getAddress())).to.not.be.reverted;
    });
  });

  // ── 11. claim() — multiple NFTs per claim (amountPerClaim=3) ────────────

  describe("claim() — multiple NFTs per claim", function () {
    beforeEach(async function () {
      nft = await deployNFT(owner, { amountPerClaim: 3n });
      await nft.setClaimEnabled(true);
    });

    it("claimer1 gets token IDs 1, 2, 3", async function () {
      const addr = await claimer1.getAddress();
      await claimer1.doClaim(await nft.getAddress());

      for (let id = 1n; id <= 3n; id++) {
        const tid = ethers.zeroPadValue(ethers.toBeHex(id), 32);
        expect(await nft.tokenOwnerOf(tid)).to.equal(addr);
      }
    });

    it("nextTokenId is 4 after claimer1 claims", async function () {
      await claimer1.doClaim(await nft.getAddress());
      expect(await nft.nextTokenId()).to.equal(4n);
    });

    it("claimer2 gets token IDs 4, 5, 6", async function () {
      await claimer1.doClaim(await nft.getAddress());
      const addr2 = await claimer2.getAddress();
      await claimer2.doClaim(await nft.getAddress());

      for (let id = 4n; id <= 6n; id++) {
        const tid = ethers.zeroPadValue(ethers.toBeHex(id), 32);
        expect(await nft.tokenOwnerOf(tid)).to.equal(addr2);
      }
    });

    it("emits NFTsClaimed with correct firstId and amount", async function () {
      const addr = await claimer1.getAddress();
      await expect(claimer1.doClaim(await nft.getAddress()))
        .to.emit(nft, "NFTsClaimed")
        .withArgs(addr, 1n, 3n);
    });

    it("totalClaimed() == 6 after two claims of 3", async function () {
      await claimer1.doClaim(await nft.getAddress());
      await claimer2.doClaim(await nft.getAddress());
      expect(await nft.totalClaimed()).to.equal(6n);
    });
  });

  // ── 12. claim() — partial claim at supply boundary ───────────────────────

  describe("claim() — partial claim at supply boundary", function () {
    beforeEach(async function () {
      nft = await deployNFT(owner, { maxSupply: 5n, amountPerClaim: 3n });
      await nft.setClaimEnabled(true);
    });

    it("claimer1 gets 3 NFTs", async function () {
      const addr = await claimer1.getAddress();
      await expect(claimer1.doClaim(await nft.getAddress()))
        .to.emit(nft, "NFTsClaimed")
        .withArgs(addr, 1n, 3n);
    });

    it("claimer2 gets 2 NFTs (partial — only 2 remain)", async function () {
      await claimer1.doClaim(await nft.getAddress());
      const addr2 = await claimer2.getAddress();
      await expect(claimer2.doClaim(await nft.getAddress()))
        .to.emit(nft, "NFTsClaimed")
        .withArgs(addr2, 4n, 2n);
    });

    it("claimer3 hits MaxSupplyReached after supply is drained", async function () {
      await claimer1.doClaim(await nft.getAddress());
      await claimer2.doClaim(await nft.getAddress());
      await expect(claimer3.doClaim(await nft.getAddress())).to.be.revertedWithCustomError(
        nft,
        "MaxSupplyReached"
      );
    });

    it("totalClaimed() == 5 after two claims", async function () {
      await claimer1.doClaim(await nft.getAddress());
      await claimer2.doClaim(await nft.getAddress());
      expect(await nft.totalClaimed()).to.equal(5n);
    });
  });

  // ── 13. isClaimActive() ──────────────────────────────────────────────────

  describe("isClaimActive()", function () {
    it("false when disabled", async function () {
      expect(await nft.isClaimActive()).to.be.false;
    });

    it("true when enabled, no restrictions", async function () {
      await nft.setClaimEnabled(true);
      expect(await nft.isClaimActive()).to.be.true;
    });

    it("false before startTime", async function () {
      const t = await now();
      await nft.setClaimEnabled(true);
      await nft.setClaimWindow(t + 9999, 0);
      expect(await nft.isClaimActive()).to.be.false;
    });

    it("false after endTime", async function () {
      const t = await now();
      await nft.setClaimEnabled(true);
      await nft.setClaimWindow(0, t + 1);
      await timeTravel(5);
      expect(await nft.isClaimActive()).to.be.false;
    });

    it("false when all supply is minted (remaining == 0)", async function () {
      nft = await deployNFT(owner, { maxSupply: 1n, amountPerClaim: 1n });
      await nft.setClaimEnabled(true);
      await claimer1.doClaim(await nft.getAddress());
      expect(await nft.isClaimActive()).to.be.false;
    });

    it("true when some supply remains even if less than amountPerClaim", async function () {
      nft = await deployNFT(owner, { maxSupply: 5n, amountPerClaim: 3n });
      await nft.setClaimEnabled(true);
      await claimer1.doClaim(await nft.getAddress());
      expect(await nft.isClaimActive()).to.be.true;
    });
  });

  // ── 14. totalClaimers() ─────────────────────────────────────────────────

  describe("totalClaimers()", function () {
    it("returns 0 initially", async function () {
      expect(await nft.totalClaimers()).to.equal(0n);
    });

    it("increments after each unique claim", async function () {
      await nft.setClaimEnabled(true);
      await claimer1.doClaim(await nft.getAddress());
      expect(await nft.totalClaimers()).to.equal(1n);
      await claimer2.doClaim(await nft.getAddress());
      expect(await nft.totalClaimers()).to.equal(2n);
    });

    it("counts unique claimers, not total NFTs", async function () {
      nft = await deployNFT(owner, { amountPerClaim: 3n });
      await nft.setClaimEnabled(true);
      await claimer1.doClaim(await nft.getAddress());
      await claimer2.doClaim(await nft.getAddress());
      expect(await nft.totalClaimers()).to.equal(2n);
      expect(await nft.totalClaimed()).to.equal(6n);
    });
  });

  // ── 15. nextTokenId() / totalClaimed() ──────────────────────────────────

  describe("nextTokenId() / totalClaimed()", function () {
    it("nextTokenId starts at 1 before any claims", async function () {
      expect(await nft.nextTokenId()).to.equal(1n);
    });

    it("totalClaimed() == nextTokenId() - 1", async function () {
      await nft.setClaimEnabled(true);
      await claimer1.doClaim(await nft.getAddress());
      const next = await nft.nextTokenId();
      expect(await nft.totalClaimed()).to.equal(next - 1n);
    });
  });

  // ── 16. meetsRequirements() ──────────────────────────────────────────────

  describe("meetsRequirements()", function () {
    it("(true, true) when no requirements", async function () {
      const [tok, fol] = await nft.meetsRequirements(await claimer1.getAddress());
      expect(tok).to.be.true;
      expect(fol).to.be.true;
    });

    it("(false, true) when token balance insufficient", async function () {
      await nft.setRequirements([await mockToken.getAddress()], [100n], 0n);
      const [tok, fol] = await nft.meetsRequirements(await claimer1.getAddress());
      expect(tok).to.be.false;
      expect(fol).to.be.true;
    });

    it("(true, false) when follower count insufficient", async function () {
      await nft.setRequirements([], [], 50n);
      const [tok, fol] = await nft.meetsRequirements(await claimer1.getAddress());
      expect(tok).to.be.true;
      expect(fol).to.be.false;
    });

    it("(true, true) when both requirements met", async function () {
      const claimerAddr = await claimer1.getAddress();
      await nft.setRequirements([await mockToken.getAddress()], [100n], 50n);
      await mockToken.setBalance(claimerAddr, 100n);
      await mockLSP26.setFollowerCount(claimerAddr, 50n);
      const [tok, fol] = await nft.meetsRequirements(claimerAddr);
      expect(tok).to.be.true;
      expect(fol).to.be.true;
    });
  });

  // ── 17. Multi-token requirements ──────────────────────────────────────────

  describe("Multi-token requirements", function () {
    it("(false, true) when first of two tokens missing", async function () {
      const claimerAddr = await claimer1.getAddress();
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      await nft.setRequirements([addr1, addr2], [100n, 200n], 0n);
      const [tok, fol] = await nft.meetsRequirements(claimerAddr);
      expect(tok).to.be.false;
      expect(fol).to.be.true;
    });

    it("(false, true) when second of two tokens missing", async function () {
      const claimerAddr = await claimer1.getAddress();
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      await nft.setRequirements([addr1, addr2], [100n, 200n], 0n);
      await mockToken.setBalance(claimerAddr, 100n);
      const [tok, fol] = await nft.meetsRequirements(claimerAddr);
      expect(tok).to.be.false;
      expect(fol).to.be.true;
    });

    it("(true, true) when both tokens held at exact minimum", async function () {
      const claimerAddr = await claimer1.getAddress();
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      await nft.setRequirements([addr1, addr2], [100n, 200n], 0n);
      await mockToken.setBalance(claimerAddr, 100n);
      await mockToken2.setBalance(claimerAddr, 200n);
      const [tok, fol] = await nft.meetsRequirements(claimerAddr);
      expect(tok).to.be.true;
      expect(fol).to.be.true;
    });

    it("batchMeetsRequirements works with 2 tokens", async function () {
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      const cAddr1 = await claimer1.getAddress();
      const cAddr2 = await claimer2.getAddress();
      const cAddr3 = await claimer3.getAddress();

      await nft.setRequirements([addr1, addr2], [100n, 200n], 0n);
      // claimer2: has token1 only
      await mockToken.setBalance(cAddr2, 100n);
      // claimer3: has both
      await mockToken.setBalance(cAddr3, 100n);
      await mockToken2.setBalance(cAddr3, 200n);

      const [tok, fol] = await nft.batchMeetsRequirements([cAddr1, cAddr2, cAddr3]);
      expect(tok[0]).to.be.false;  // claimer1 fails
      expect(tok[1]).to.be.false;  // claimer2 fails (missing token2)
      expect(tok[2]).to.be.true;   // claimer3 passes
      expect(fol[0]).to.be.true;
      expect(fol[1]).to.be.true;
      expect(fol[2]).to.be.true;
    });
  });

  // ── 18. batchHasClaimed() ─────────────────────────────────────────────────

  describe("batchHasClaimed()", function () {
    it("returns empty array for empty input", async function () {
      expect(await nft.batchHasClaimed([])).to.deep.equal([]);
    });

    it("returns [false] for an address that has not claimed", async function () {
      const addr = await claimer1.getAddress();
      const results = await nft.batchHasClaimed([addr]);
      expect(results[0]).to.be.false;
    });

    it("returns [true] for an address that has claimed", async function () {
      await nft.setClaimEnabled(true);
      const addr = await claimer1.getAddress();
      await claimer1.doClaim(await nft.getAddress());
      const results = await nft.batchHasClaimed([addr]);
      expect(results[0]).to.be.true;
    });

    it("returns mixed results for a batch of addresses", async function () {
      await nft.setClaimEnabled(true);
      await claimer1.doClaim(await nft.getAddress());

      const addr1 = await claimer1.getAddress();
      const addr2 = await claimer2.getAddress();
      const addr3 = await claimer3.getAddress();

      const results = await nft.batchHasClaimed([addr1, addr2, addr3]);
      expect(results[0]).to.be.true;
      expect(results[1]).to.be.false;
      expect(results[2]).to.be.false;
    });

    it("reflects state after multiple claims", async function () {
      await nft.setClaimEnabled(true);
      await claimer1.doClaim(await nft.getAddress());
      await claimer2.doClaim(await nft.getAddress());

      const addr1 = await claimer1.getAddress();
      const addr2 = await claimer2.getAddress();
      const addr3 = await claimer3.getAddress();

      const results = await nft.batchHasClaimed([addr1, addr2, addr3]);
      expect(results[0]).to.be.true;
      expect(results[1]).to.be.true;
      expect(results[2]).to.be.false;
    });
  });

  // ── 19. batchMeetsRequirements() ─────────────────────────────────────────

  describe("batchMeetsRequirements()", function () {
    it("returns empty arrays for empty input", async function () {
      const [tok, fol] = await nft.batchMeetsRequirements([]);
      expect(tok).to.deep.equal([]);
      expect(fol).to.deep.equal([]);
    });

    it("returns correct results for multiple addresses", async function () {
      const addr1 = await claimer1.getAddress();
      const addr2 = await claimer2.getAddress();
      const tokenAddr = await mockToken.getAddress();

      await nft.setRequirements([tokenAddr], [100n], 20n);
      await mockToken.setBalance(addr2, 100n);
      await mockLSP26.setFollowerCount(addr2, 20n);

      const [tok, fol] = await nft.batchMeetsRequirements([addr1, addr2]);

      expect(tok[0]).to.be.false;
      expect(fol[0]).to.be.false;
      expect(tok[1]).to.be.true;
      expect(fol[1]).to.be.true;
    });
  });
});
