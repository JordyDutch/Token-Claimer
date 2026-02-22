/**
 * LSP7ClaimableToken.test.ts
 *
 * Full test suite for LSP7ClaimableToken:
 *   - Deployment + constructor validation
 *   - Owner control functions (setClaimEnabled, setClaimWindow, setAmountPerClaim,
 *     setRequirements, rescueLYX)
 *   - claim() — happy path, all revert paths, reentrancy guard
 *   - isClaimActive() view
 *   - totalClaimers() view
 *   - meetsRequirements() / batchMeetsRequirements() views
 *
 * Key constraint: LSP7._mint with force=false reverts for EOAs and contracts that
 * don't support LSP1 (0x6bb56a14). Tests use MockLSP1Account contracts as claimers
 * — they implement universalReceiver() and report the LSP1 interface via supportsInterface.
 *
 * The LSP26 follower registry is hardcoded in the contract at
 * 0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA. We inject MockLSP26 bytecode
 * at that address via hardhat_setCode before each suite.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  LSP7ClaimableToken,
  MockLSP1Account,
  MockToken,
  MockLSP26,
} from "../typechain-types";

// ── Constants ──────────────────────────────────────────────────────────────

const LSP26_REGISTRY = "0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA";

// LSP4 ERC725Y data keys for token name/symbol (LUKSO stores metadata via getData/setData)
const LSP4_TOKEN_NAME_KEY =
  "0xdeba1e292f8ba88238e10ab3c7f88bd4be4fac56cad5194b6ecceaf653468af1";
const LSP4_TOKEN_SYMBOL_KEY =
  "0x2f0a68ab07768e01943a599e73362a0e17a63a72e94dd2e384d2c1d4db932756";
const AMOUNT_PER_CLAIM = ethers.parseEther("100");
const MAX_SUPPLY_UNLIMITED = 0n;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Inject MockLSP26 bytecode at the hardcoded registry address. */
async function injectMockLSP26(): Promise<MockLSP26> {
  const Factory = await ethers.getContractFactory("MockLSP26");
  const temp = await Factory.deploy();
  const code = await ethers.provider.getCode(await temp.getAddress());
  await ethers.provider.send("hardhat_setCode", [LSP26_REGISTRY, code]);
  return Factory.attach(LSP26_REGISTRY) as unknown as MockLSP26;
}

/** Deploy a MockLSP1Account — used as a claimer that can receive LSP7 tokens. */
async function deployAccount(): Promise<MockLSP1Account> {
  const Factory = await ethers.getContractFactory("MockLSP1Account");
  return (await Factory.deploy()) as MockLSP1Account;
}

/** Advance block timestamp by `seconds`. */
async function timeTravel(seconds: number): Promise<void> {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

/** Return current block timestamp. */
async function now(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe("LSP7ClaimableToken", function () {
  let token: LSP7ClaimableToken;
  let owner: SignerWithAddress;
  let stranger: SignerWithAddress;
  let mockLSP26: MockLSP26;
  let mockToken: MockToken;
  let claimer1: MockLSP1Account;
  let claimer2: MockLSP1Account;
  let claimer3: MockLSP1Account;

  beforeEach(async function () {
    [owner, stranger] = await ethers.getSigners();

    // Inject LSP26 mock at the hardcoded registry address
    mockLSP26 = await injectMockLSP26();

    // Deploy required-token mock
    const MockTokenFactory = await ethers.getContractFactory("MockToken");
    mockToken = (await MockTokenFactory.deploy()) as MockToken;

    // Deploy three mock LSP1 accounts (serve as claimers)
    claimer1 = await deployAccount();
    claimer2 = await deployAccount();
    claimer3 = await deployAccount();

    // Deploy the main token contract
    const TokenFactory = await ethers.getContractFactory("LSP7ClaimableToken");
    token = (await TokenFactory.deploy(
      "Test Token",
      "TST",
      owner.address,
      AMOUNT_PER_CLAIM,
      MAX_SUPPLY_UNLIMITED,
      false // 18 decimals
    )) as LSP7ClaimableToken;
  });

  // ── 1. Deployment ────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("stores name correctly (via LSP4 ERC725Y getData)", async function () {
      // LUKSO LSP7 stores name as ERC725Y bytes data — not a plain view function.
      const nameBytes = await token.getData(LSP4_TOKEN_NAME_KEY);
      expect(ethers.toUtf8String(nameBytes)).to.equal("Test Token");
    });

    it("stores symbol correctly (via LSP4 ERC725Y getData)", async function () {
      const symbolBytes = await token.getData(LSP4_TOKEN_SYMBOL_KEY);
      expect(ethers.toUtf8String(symbolBytes)).to.equal("TST");
    });

    it("sets amountPerClaim", async function () {
      expect(await token.amountPerClaim()).to.equal(AMOUNT_PER_CLAIM);
    });

    it("sets maxSupply (unlimited = 0)", async function () {
      expect(await token.maxSupply()).to.equal(0n);
    });

    it("disables claiming by default", async function () {
      expect(await token.claimEnabled()).to.be.false;
    });

    it("starts with totalClaimedAmount = 0", async function () {
      expect(await token.totalClaimedAmount()).to.equal(0n);
    });

    it("starts with claimerCount = 0", async function () {
      expect(await token.claimerCount()).to.equal(0n);
    });

    it("sets owner to the constructor argument", async function () {
      expect(await token.owner()).to.equal(owner.address);
    });

    it("uses 18 decimals when isNonDivisible_=false", async function () {
      const Factory = await ethers.getContractFactory("LSP7ClaimableToken");
      const t = await Factory.deploy("D", "D", owner.address, 1n, 0n, false);
      expect(await t.decimals()).to.equal(18n);
    });

    it("uses 0 decimals when isNonDivisible_=true", async function () {
      const Factory = await ethers.getContractFactory("LSP7ClaimableToken");
      const t = await Factory.deploy("D", "D", owner.address, 1n, 0n, true);
      expect(await t.decimals()).to.equal(0n);
    });

    it("reverts when amountPerClaim_ is 0", async function () {
      const Factory = await ethers.getContractFactory("LSP7ClaimableToken");
      await expect(
        Factory.deploy("D", "D", owner.address, 0n, 0n, false)
      ).to.be.revertedWith("amountPerClaim must be > 0");
    });
  });

  // ── 2. receive() ─────────────────────────────────────────────────────────

  describe("receive()", function () {
    it("accepts LYX without reverting", async function () {
      await expect(
        owner.sendTransaction({ to: await token.getAddress(), value: ethers.parseEther("1") })
      ).to.not.be.reverted;
    });
  });

  // ── 3. setClaimEnabled ───────────────────────────────────────────────────

  describe("setClaimEnabled", function () {
    it("owner can enable claiming", async function () {
      await token.setClaimEnabled(true);
      expect(await token.claimEnabled()).to.be.true;
    });

    it("owner can disable claiming", async function () {
      await token.setClaimEnabled(true);
      await token.setClaimEnabled(false);
      expect(await token.claimEnabled()).to.be.false;
    });

    it("emits ClaimToggled(true) on enable", async function () {
      await expect(token.setClaimEnabled(true))
        .to.emit(token, "ClaimToggled")
        .withArgs(true);
    });

    it("emits ClaimToggled(false) on disable", async function () {
      await token.setClaimEnabled(true);
      await expect(token.setClaimEnabled(false))
        .to.emit(token, "ClaimToggled")
        .withArgs(false);
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        token.connect(stranger).setClaimEnabled(true)
      ).to.be.reverted;
    });
  });

  // ── 4. setClaimWindow ────────────────────────────────────────────────────

  describe("setClaimWindow", function () {
    it("sets startTime and endTime", async function () {
      const t = await now();
      await token.setClaimWindow(t, t + 3600);
      expect(await token.startTime()).to.equal(BigInt(t));
      expect(await token.endTime()).to.equal(BigInt(t + 3600));
    });

    it("emits ClaimWindowSet", async function () {
      const t = await now();
      await expect(token.setClaimWindow(t, t + 3600))
        .to.emit(token, "ClaimWindowSet")
        .withArgs(BigInt(t), BigInt(t + 3600));
    });

    it("allows both 0 (unrestricted)", async function () {
      await expect(token.setClaimWindow(0, 0)).to.not.be.reverted;
    });

    it("allows end=0 with non-zero start", async function () {
      const t = await now();
      await expect(token.setClaimWindow(t, 0)).to.not.be.reverted;
    });

    it("reverts when end <= start (and end != 0)", async function () {
      const t = await now();
      await expect(token.setClaimWindow(t + 100, t + 50)).to.be.revertedWith(
        "Invalid window"
      );
    });

    it("reverts when end == start (and end != 0)", async function () {
      const t = await now();
      await expect(token.setClaimWindow(t, t)).to.be.revertedWith(
        "Invalid window"
      );
    });

    it("reverts when called by non-owner", async function () {
      const t = await now();
      await expect(
        token.connect(stranger).setClaimWindow(t, t + 3600)
      ).to.be.reverted;
    });
  });

  // ── 5. setAmountPerClaim ─────────────────────────────────────────────────

  describe("setAmountPerClaim", function () {
    it("updates amountPerClaim", async function () {
      const newAmount = ethers.parseEther("50");
      await token.setAmountPerClaim(newAmount);
      expect(await token.amountPerClaim()).to.equal(newAmount);
    });

    it("emits AmountPerClaimUpdated", async function () {
      const newAmount = ethers.parseEther("50");
      await expect(token.setAmountPerClaim(newAmount))
        .to.emit(token, "AmountPerClaimUpdated")
        .withArgs(newAmount);
    });

    it("reverts when amount is 0", async function () {
      await expect(token.setAmountPerClaim(0n)).to.be.revertedWith(
        "Out of range"
      );
    });

    it("reverts when amount exceeds 1e24", async function () {
      const tooMuch = ethers.parseUnits("1", 25); // 1e25 > 1e24
      await expect(token.setAmountPerClaim(tooMuch)).to.be.revertedWith(
        "Out of range"
      );
    });

    it("accepts exactly 1e24", async function () {
      const max = ethers.parseUnits("1", 24);
      await expect(token.setAmountPerClaim(max)).to.not.be.reverted;
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        token.connect(stranger).setAmountPerClaim(1n)
      ).to.be.reverted;
    });
  });

  // ── 6. setRequirements ───────────────────────────────────────────────────

  describe("setRequirements", function () {
    it("stores requiredToken, requiredTokenAmount, requiredFollowers", async function () {
      const tokenAddr = await mockToken.getAddress();
      await token.setRequirements(tokenAddr, 500n, 10n);
      expect(await token.requiredToken()).to.equal(tokenAddr);
      expect(await token.requiredTokenAmount()).to.equal(500n);
      expect(await token.requiredFollowers()).to.equal(10n);
    });

    it("emits RequirementsUpdated", async function () {
      const tokenAddr = await mockToken.getAddress();
      await expect(token.setRequirements(tokenAddr, 500n, 10n))
        .to.emit(token, "RequirementsUpdated")
        .withArgs(tokenAddr, 500n, 10n);
    });

    it("can clear requirements by passing address(0), 0, 0", async function () {
      await token.setRequirements(await mockToken.getAddress(), 500n, 10n);
      await token.setRequirements(ethers.ZeroAddress, 0n, 0n);
      expect(await token.requiredToken()).to.equal(ethers.ZeroAddress);
      expect(await token.requiredTokenAmount()).to.equal(0n);
      expect(await token.requiredFollowers()).to.equal(0n);
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        token.connect(stranger).setRequirements(ethers.ZeroAddress, 0n, 0n)
      ).to.be.reverted;
    });
  });

  // ── 7. rescueLYX ─────────────────────────────────────────────────────────

  describe("rescueLYX", function () {
    const sendAmount = ethers.parseEther("1");

    beforeEach(async function () {
      // Fund the token contract
      await owner.sendTransaction({ to: await token.getAddress(), value: sendAmount });
    });

    it("transfers LYX to the specified address", async function () {
      const recipient = await claimer1.getAddress();
      const before = await ethers.provider.getBalance(recipient);
      await token.rescueLYX(recipient as any, sendAmount);
      const after = await ethers.provider.getBalance(recipient);
      expect(after - before).to.equal(sendAmount);
    });

    it("emits LYXRescued", async function () {
      const recipient = await claimer1.getAddress();
      await expect(token.rescueLYX(recipient as any, sendAmount))
        .to.emit(token, "LYXRescued")
        .withArgs(recipient, sendAmount);
    });

    it("reverts when called by non-owner", async function () {
      const recipient = await claimer1.getAddress();
      await expect(
        token.connect(stranger).rescueLYX(recipient as any, sendAmount)
      ).to.be.reverted;
    });
  });

  // ── 8. claim() — revert paths ────────────────────────────────────────────

  describe("claim() reverts", function () {
    it("reverts with ClaimNotActive when claiming is disabled", async function () {
      await expect(claimer1.doClaim(await token.getAddress())).to.be.revertedWithCustomError(
        token,
        "ClaimNotActive"
      );
    });

    it("reverts with AlreadyClaimed on second attempt", async function () {
      await token.setClaimEnabled(true);
      await claimer1.doClaim(await token.getAddress());
      await expect(claimer1.doClaim(await token.getAddress())).to.be.revertedWithCustomError(
        token,
        "AlreadyClaimed"
      );
    });

    it("reverts with OutsideClaimWindow before startTime", async function () {
      const t = await now();
      await token.setClaimEnabled(true);
      await token.setClaimWindow(t + 9999, 0); // future start
      await expect(claimer1.doClaim(await token.getAddress())).to.be.revertedWithCustomError(
        token,
        "OutsideClaimWindow"
      );
    });

    it("reverts with OutsideClaimWindow after endTime", async function () {
      const t = await now();
      await token.setClaimEnabled(true);
      await token.setClaimWindow(0, t + 1); // ends 1 second from now
      await timeTravel(5); // jump past end
      await expect(claimer1.doClaim(await token.getAddress())).to.be.revertedWithCustomError(
        token,
        "OutsideClaimWindow"
      );
    });

    it("reverts with MaxSupplyReached when supply is full", async function () {
      // Deploy with maxSupply = 1 amountPerClaim worth
      const Factory = await ethers.getContractFactory("LSP7ClaimableToken");
      const limited = (await Factory.deploy(
        "Limited",
        "LTD",
        owner.address,
        AMOUNT_PER_CLAIM,
        AMOUNT_PER_CLAIM, // maxSupply == amountPerClaim — only one claim fits
        false
      )) as LSP7ClaimableToken;
      await limited.setClaimEnabled(true);
      await claimer1.doClaim(await limited.getAddress()); // first claim OK
      await expect(claimer2.doClaim(await limited.getAddress())).to.be.revertedWithCustomError(
        limited,
        "MaxSupplyReached"
      );
    });

    it("reverts with InsufficientTokenBalance when required token not held", async function () {
      await token.setClaimEnabled(true);
      const tokenAddr = await mockToken.getAddress();
      await token.setRequirements(tokenAddr, 1000n, 0n);
      // claimer1 has 0 balance in MockToken — requirement fails
      await expect(claimer1.doClaim(await token.getAddress())).to.be.revertedWithCustomError(
        token,
        "InsufficientTokenBalance"
      );
    });

    it("reverts with InsufficientFollowers when not enough LSP26 followers", async function () {
      await token.setClaimEnabled(true);
      await token.setRequirements(ethers.ZeroAddress, 0n, 100n); // need 100 followers
      // claimer1 has 0 followers (default mockLSP26 returns 0)
      await expect(claimer1.doClaim(await token.getAddress())).to.be.revertedWithCustomError(
        token,
        "InsufficientFollowers"
      );
    });
  });

  // ── 9. claim() — happy path ──────────────────────────────────────────────

  describe("claim() success", function () {
    beforeEach(async function () {
      await token.setClaimEnabled(true);
    });

    it("sets hasClaimed[claimer] to true", async function () {
      const addr = await claimer1.getAddress();
      expect(await token.hasClaimed(addr)).to.be.false;
      await claimer1.doClaim(await token.getAddress());
      expect(await token.hasClaimed(addr)).to.be.true;
    });

    it("mints amountPerClaim tokens to the claimer", async function () {
      const addr = await claimer1.getAddress();
      await claimer1.doClaim(await token.getAddress());
      expect(await token.balanceOf(addr)).to.equal(AMOUNT_PER_CLAIM);
    });

    it("increments totalClaimedAmount by amountPerClaim", async function () {
      await claimer1.doClaim(await token.getAddress());
      expect(await token.totalClaimedAmount()).to.equal(AMOUNT_PER_CLAIM);
    });

    it("increments claimerCount", async function () {
      await claimer1.doClaim(await token.getAddress());
      expect(await token.claimerCount()).to.equal(1n);
    });

    it("emits TokensClaimed(claimer, amount)", async function () {
      const addr = await claimer1.getAddress();
      await expect(claimer1.doClaim(await token.getAddress()))
        .to.emit(token, "TokensClaimed")
        .withArgs(addr, AMOUNT_PER_CLAIM);
    });

    it("allows multiple different claimers", async function () {
      await claimer1.doClaim(await token.getAddress());
      await claimer2.doClaim(await token.getAddress());
      await claimer3.doClaim(await token.getAddress());
      expect(await token.claimerCount()).to.equal(3n);
      expect(await token.totalClaimedAmount()).to.equal(AMOUNT_PER_CLAIM * 3n);
    });

    it("works when requiredToken balance is exactly the minimum", async function () {
      const tokenAddr = await mockToken.getAddress();
      const claimerAddr = await claimer1.getAddress();
      await token.setRequirements(tokenAddr, 500n, 0n);
      await mockToken.setBalance(claimerAddr, 500n); // exactly meets requirement
      await expect(claimer1.doClaim(await token.getAddress())).to.not.be.reverted;
    });

    it("works when follower count exactly meets the minimum", async function () {
      const claimerAddr = await claimer1.getAddress();
      await token.setRequirements(ethers.ZeroAddress, 0n, 50n);
      await mockLSP26.setFollowerCount(claimerAddr, 50n); // exactly 50
      await expect(claimer1.doClaim(await token.getAddress())).to.not.be.reverted;
    });

    it("works within a valid claim window", async function () {
      const t = await now();
      await token.setClaimWindow(t - 10, t + 9999);
      await expect(claimer1.doClaim(await token.getAddress())).to.not.be.reverted;
    });
  });

  // ── 10. isClaimActive() ──────────────────────────────────────────────────

  describe("isClaimActive()", function () {
    it("returns false when disabled", async function () {
      expect(await token.isClaimActive()).to.be.false;
    });

    it("returns true when enabled with no restrictions", async function () {
      await token.setClaimEnabled(true);
      expect(await token.isClaimActive()).to.be.true;
    });

    it("returns false before startTime", async function () {
      const t = await now();
      await token.setClaimEnabled(true);
      await token.setClaimWindow(t + 9999, 0);
      expect(await token.isClaimActive()).to.be.false;
    });

    it("returns false after endTime", async function () {
      const t = await now();
      await token.setClaimEnabled(true);
      await token.setClaimWindow(0, t + 1);
      await timeTravel(5);
      expect(await token.isClaimActive()).to.be.false;
    });

    it("returns false when maxSupply is exhausted", async function () {
      const Factory = await ethers.getContractFactory("LSP7ClaimableToken");
      const limited = (await Factory.deploy(
        "L",
        "L",
        owner.address,
        AMOUNT_PER_CLAIM,
        AMOUNT_PER_CLAIM, // one claim fits
        false
      )) as LSP7ClaimableToken;
      await limited.setClaimEnabled(true);
      await claimer1.doClaim(await limited.getAddress());
      expect(await limited.isClaimActive()).to.be.false;
    });
  });

  // ── 11. totalClaimers() ──────────────────────────────────────────────────

  describe("totalClaimers()", function () {
    it("returns 0 initially", async function () {
      expect(await token.totalClaimers()).to.equal(0n);
    });

    it("increments after each unique claim", async function () {
      await token.setClaimEnabled(true);
      await claimer1.doClaim(await token.getAddress());
      expect(await token.totalClaimers()).to.equal(1n);
      await claimer2.doClaim(await token.getAddress());
      expect(await token.totalClaimers()).to.equal(2n);
    });
  });

  // ── 12. meetsRequirements() ──────────────────────────────────────────────

  describe("meetsRequirements()", function () {
    it("returns (true, true) when no requirements are set", async function () {
      const addr = await claimer1.getAddress();
      const [tok, fol] = await token.meetsRequirements(addr);
      expect(tok).to.be.true;
      expect(fol).to.be.true;
    });

    it("returns (false, true) when token balance insufficient", async function () {
      const claimerAddr = await claimer1.getAddress();
      const tokenAddr = await mockToken.getAddress();
      await token.setRequirements(tokenAddr, 1000n, 0n);
      // balance stays 0
      const [tok, fol] = await token.meetsRequirements(claimerAddr);
      expect(tok).to.be.false;
      expect(fol).to.be.true;
    });

    it("returns (true, false) when follower count insufficient", async function () {
      const addr = await claimer1.getAddress();
      await token.setRequirements(ethers.ZeroAddress, 0n, 100n);
      // follower count is 0
      const [tok, fol] = await token.meetsRequirements(addr);
      expect(tok).to.be.true;
      expect(fol).to.be.false;
    });

    it("returns (false, false) when both requirements fail", async function () {
      const claimerAddr = await claimer1.getAddress();
      const tokenAddr = await mockToken.getAddress();
      await token.setRequirements(tokenAddr, 1000n, 100n);
      const [tok, fol] = await token.meetsRequirements(claimerAddr);
      expect(tok).to.be.false;
      expect(fol).to.be.false;
    });

    it("returns (true, true) when all requirements are met", async function () {
      const claimerAddr = await claimer1.getAddress();
      const tokenAddr = await mockToken.getAddress();
      await token.setRequirements(tokenAddr, 1000n, 100n);
      await mockToken.setBalance(claimerAddr, 1000n);
      await mockLSP26.setFollowerCount(claimerAddr, 100n);
      const [tok, fol] = await token.meetsRequirements(claimerAddr);
      expect(tok).to.be.true;
      expect(fol).to.be.true;
    });

    it("ignores token requirement when requiredTokenAmount is 0", async function () {
      const addr = await claimer1.getAddress();
      // requiredToken is set but amount is 0 → no token check
      await token.setRequirements(await mockToken.getAddress(), 0n, 0n);
      const [tok, fol] = await token.meetsRequirements(addr);
      expect(tok).to.be.true;
      expect(fol).to.be.true;
    });
  });

  // ── 13. batchMeetsRequirements() ────────────────────────────────────────

  describe("batchMeetsRequirements()", function () {
    it("returns empty arrays for empty input", async function () {
      const [tok, fol] = await token.batchMeetsRequirements([]);
      expect(tok).to.deep.equal([]);
      expect(fol).to.deep.equal([]);
    });

    it("returns single result for single address", async function () {
      const addr = await claimer1.getAddress();
      const [tok, fol] = await token.batchMeetsRequirements([addr]);
      expect(tok.length).to.equal(1);
      expect(fol.length).to.equal(1);
      expect(tok[0]).to.be.true;
      expect(fol[0]).to.be.true;
    });

    it("returns mixed results for addresses with different balances", async function () {
      const addr1 = await claimer1.getAddress();
      const addr2 = await claimer2.getAddress();
      const addr3 = await claimer3.getAddress();
      const tokenAddr = await mockToken.getAddress();

      await token.setRequirements(tokenAddr, 500n, 10n);
      // addr1: meets neither
      // addr2: meets token only
      await mockToken.setBalance(addr2, 500n);
      // addr3: meets both
      await mockToken.setBalance(addr3, 500n);
      await mockLSP26.setFollowerCount(addr3, 10n);

      const [tok, fol] = await token.batchMeetsRequirements([addr1, addr2, addr3]);

      expect(tok[0]).to.be.false; // addr1 token fail
      expect(fol[0]).to.be.false; // addr1 follower fail
      expect(tok[1]).to.be.true;  // addr2 token ok
      expect(fol[1]).to.be.false; // addr2 follower fail
      expect(tok[2]).to.be.true;  // addr3 token ok
      expect(fol[2]).to.be.true;  // addr3 follower ok
    });
  });
});
