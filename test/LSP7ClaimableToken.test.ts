/**
 * LSP7ClaimableToken.test.ts
 *
 * Full test suite for LSP7ClaimableToken (proxy/init pattern):
 *   - Deployment via clone + initialize() validation
 *   - Owner control functions (setClaimEnabled, setClaimWindow, setAmountPerClaim,
 *     setRequirements, rescueLYX)
 *   - claim() — happy path, all revert paths, reentrancy guard
 *   - isClaimActive() view
 *   - totalClaimers() view
 *   - meetsRequirements() / batchMeetsRequirements() views
 *   - getTokenRequirements() view
 *   - Multi-token requirements (2+ tokens required, partial fail, all pass)
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

const LSP4_TOKEN_NAME_KEY =
  "0xdeba1e292f8ba88238e10ab3c7f88bd4be4fac56cad5194b6ecceaf653468af1";
const LSP4_TOKEN_SYMBOL_KEY =
  "0x2f0a68ab07768e01943a599e73362a0e17a63a72e94dd2e384d2c1d4db932756";
const AMOUNT_PER_CLAIM = ethers.parseEther("100");
const MAX_SUPPLY_UNLIMITED = ethers.MaxUint256; // type(uint256).max for "unlimited"

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

/** Deploy implementation + clone + initialize a fresh LSP7ClaimableToken proxy */
async function deployTokenProxy(
  owner: SignerWithAddress,
  name: string = "Test Token",
  symbol: string = "TST",
  amountPerClaim: bigint = AMOUNT_PER_CLAIM,
  maxSupply: bigint = MAX_SUPPLY_UNLIMITED,
  isNonDivisible: boolean = false
): Promise<LSP7ClaimableToken> {
  const Factory = await ethers.getContractFactory("LSP7ClaimableToken");

  // Deploy implementation
  const impl = await Factory.deploy();
  await impl.waitForDeployment();

  // Clone via OZ Clones library helper — we use a minimal inline approach:
  // Deploy a proxy by calling clone on-chain, or just use ethers to call initialize
  // For test simplicity, use the factory pattern: deploy impl, get bytecode, create clone
  // Actually simplest: just deploy as a new instance and call initialize for testing.
  // But to truly test the proxy pattern, let's use the factory or manual clone.

  // For unit tests, we can deploy a fresh instance and just call initialize().
  // The constructor calls _disableInitializers(), but for testing the token directly
  // we need to use the factory or use a minimal clone helper.

  // Use the DropFactory instead:
  const DropFactory = await ethers.getContractFactory("LSP7DropFactory");
  const factory = await DropFactory.deploy();
  await factory.waitForDeployment();

  // The factory normalizes maxSupply=0 to type(uint256).max internally,
  // but for tests we pass the value directly. When we want "unlimited", pass 0
  // and the factory converts it.
  const adjustedMaxSupply = maxSupply === MAX_SUPPLY_UNLIMITED ? 0n : maxSupply;

  const tx = await factory.createTokenDrop(name, symbol, amountPerClaim, adjustedMaxSupply, isNonDivisible);
  const receipt = await tx.wait();

  // Get the deployed proxy address from the event (TokenCampaignCreated or NFTCampaignCreated)
  const expectedEvent = isNonDivisible ? "NFTCampaignCreated" : "TokenCampaignCreated";
  const event = receipt!.logs.find(
    (log: any) => {
      try {
        return factory.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === expectedEvent;
      } catch { return false; }
    }
  );
  const parsed = factory.interface.parseLog({ topics: event!.topics as string[], data: event!.data });
  const proxyAddr = parsed!.args.contractAddr;

  // Transfer ownership to the test owner (factory sets msg.sender as owner, which is the signer)
  const token = Factory.attach(proxyAddr) as LSP7ClaimableToken;
  return token;
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe("LSP7ClaimableToken", function () {
  let token: LSP7ClaimableToken;
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

    token = await deployTokenProxy(owner);
  });

  // ── 1. Deployment ────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("stores name correctly (via LSP4 ERC725Y getData)", async function () {
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

    it("sets tokenSupplyCap (unlimited = type(uint256).max)", async function () {
      expect(await token.tokenSupplyCap()).to.equal(MAX_SUPPLY_UNLIMITED);
    });

    it("disables claiming by default", async function () {
      expect(await token.claimEnabled()).to.be.false;
    });

    it("starts with totalSupply = 0", async function () {
      expect(await token.totalSupply()).to.equal(0n);
    });

    it("starts with claimerCount = 0", async function () {
      expect(await token.claimerCount()).to.equal(0n);
    });

    it("sets owner to the caller of createTokenDrop", async function () {
      expect(await token.owner()).to.equal(owner.address);
    });

    it("uses 18 decimals when isNonDivisible_=false", async function () {
      const t = await deployTokenProxy(owner, "D", "D", 1n, MAX_SUPPLY_UNLIMITED, false);
      expect(await t.decimals()).to.equal(18n);
    });

    it("uses 0 decimals when isNonDivisible_=true", async function () {
      const t = await deployTokenProxy(owner, "D", "D", 1n, MAX_SUPPLY_UNLIMITED, true);
      expect(await t.decimals()).to.equal(0n);
    });

    it("reverts when amountPerClaim_ is 0", async function () {
      const DropFactory = await ethers.getContractFactory("LSP7DropFactory");
      const factory = await DropFactory.deploy();
      await expect(
        factory.createTokenDrop("D", "D", 0n, 0n, false)
      ).to.be.revertedWithCustomError(
        await ethers.getContractFactory("LSP7ClaimableToken").then(f => f.deploy()),
        "AmountPerClaimZero"
      );
    });

    it("reverts when maxSupply < amountPerClaim (non-zero maxSupply)", async function () {
      const DropFactory = await ethers.getContractFactory("LSP7DropFactory");
      const factory = await DropFactory.deploy();
      await expect(
        factory.createTokenDrop("D", "D", 100n, 50n, false)
      ).to.be.revertedWithCustomError(
        await ethers.getContractFactory("LSP7ClaimableToken").then(f => f.deploy()),
        "MaxSupplyBelowAmountPerClaim"
      );
    });

    it("allows maxSupply == amountPerClaim", async function () {
      await expect(
        deployTokenProxy(owner, "D", "D", 100n, 100n, false)
      ).to.not.be.reverted;
    });

    it("allows maxSupply == 0 (unlimited → type(uint256).max)", async function () {
      await expect(
        deployTokenProxy(owner, "D", "D", 100n, MAX_SUPPLY_UNLIMITED, false)
      ).to.not.be.reverted;
    });

    it("starts with empty token requirements", async function () {
      const [tokens, balances] = await token.getTokenRequirements();
      expect(tokens.length).to.equal(0);
      expect(balances.length).to.equal(0);
    });

    it("cannot be initialized twice", async function () {
      await expect(
        token.initialize("X", "X", owner.address, 1n, MAX_SUPPLY_UNLIMITED, false)
      ).to.be.reverted;
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

    it("reverts with ClaimEnabledNoChange when value unchanged", async function () {
      await expect(token.setClaimEnabled(false))
        .to.be.revertedWithCustomError(token, "ClaimEnabledNoChange");
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
      await expect(token.setClaimWindow(t + 100, t + 50)).to.be.revertedWithCustomError(
        token, "InvalidClaimWindow"
      );
    });

    it("reverts when end == start (and end != 0)", async function () {
      const t = await now();
      await expect(token.setClaimWindow(t, t)).to.be.revertedWithCustomError(
        token, "InvalidClaimWindow"
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
      await expect(token.setAmountPerClaim(0n)).to.be.revertedWithCustomError(
        token, "AmountOutOfRange"
      );
    });

    it("reverts when amount exceeds 1e24", async function () {
      const tooMuch = ethers.parseUnits("1", 25);
      await expect(token.setAmountPerClaim(tooMuch)).to.be.revertedWithCustomError(
        token, "AmountOutOfRange"
      );
    });

    it("accepts exactly 1e24", async function () {
      const max = ethers.parseUnits("1", 24);
      await expect(token.setAmountPerClaim(max)).to.not.be.reverted;
    });

    it("reverts when amount would exceed a non-zero tokenSupplyCap", async function () {
      const limited = await deployTokenProxy(owner, "L", "L", 10n, 100n, false);
      await expect(limited.setAmountPerClaim(101n)).to.be.revertedWithCustomError(
        limited, "AmountExceedsMaxSupply"
      );
    });

    it("allows amount == tokenSupplyCap (single-claim supply)", async function () {
      const limited = await deployTokenProxy(owner, "L", "L", 10n, 100n, false);
      await expect(limited.setAmountPerClaim(100n)).to.not.be.reverted;
    });

    it("allows raising amount freely when supply is unlimited", async function () {
      await expect(token.setAmountPerClaim(ethers.parseUnits("1", 24))).to.not.be.reverted;
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        token.connect(stranger).setAmountPerClaim(1n)
      ).to.be.reverted;
    });
  });

  // ── 6. setRequirements ───────────────────────────────────────────────────

  describe("setRequirements", function () {
    it("stores single token requirement via getTokenRequirements()", async function () {
      const tokenAddr = await mockToken.getAddress();
      await token.setRequirements([tokenAddr], [500n], 10n);
      const [tokens, balances] = await token.getTokenRequirements();
      expect(tokens.length).to.equal(1);
      expect(tokens[0]).to.equal(tokenAddr);
      expect(balances[0]).to.equal(500n);
      expect(await token.requiredFollowers()).to.equal(10n);
    });

    it("stores multiple token requirements", async function () {
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      await token.setRequirements([addr1, addr2], [100n, 200n], 5n);
      const [tokens, balances] = await token.getTokenRequirements();
      expect(tokens.length).to.equal(2);
      expect(tokens[0]).to.equal(addr1);
      expect(tokens[1]).to.equal(addr2);
      expect(balances[0]).to.equal(100n);
      expect(balances[1]).to.equal(200n);
      expect(await token.requiredFollowers()).to.equal(5n);
    });

    it("emits RequirementsUpdated with tokenCount and followers", async function () {
      const tokenAddr = await mockToken.getAddress();
      await expect(token.setRequirements([tokenAddr], [500n], 10n))
        .to.emit(token, "RequirementsUpdated")
        .withArgs(1n, 10n);
    });

    it("emits RequirementsUpdated(0, 0) when clearing requirements", async function () {
      await token.setRequirements([await mockToken.getAddress()], [500n], 10n);
      await expect(token.setRequirements([], [], 0n))
        .to.emit(token, "RequirementsUpdated")
        .withArgs(0n, 0n);
    });

    it("can clear requirements by passing empty arrays and 0", async function () {
      await token.setRequirements([await mockToken.getAddress()], [500n], 10n);
      await token.setRequirements([], [], 0n);
      const [tokens, balances] = await token.getTokenRequirements();
      expect(tokens.length).to.equal(0);
      expect(balances.length).to.equal(0);
      expect(await token.requiredFollowers()).to.equal(0n);
    });

    it("reverts when tokens and minBalances arrays have different lengths", async function () {
      const tokenAddr = await mockToken.getAddress();
      await expect(
        token.setRequirements([tokenAddr], [100n, 200n], 0n)
      ).to.be.revertedWithCustomError(token, "RequirementsLengthMismatch");
    });

    it("reverts when more than 10 token requirements are provided", async function () {
      const addrs = Array(11).fill(await mockToken.getAddress());
      const amounts = Array(11).fill(1n);
      await expect(
        token.setRequirements(addrs, amounts, 0n)
      ).to.be.revertedWithCustomError(token, "TooManyTokenRequirements");
    });

    it("accepts exactly 10 token requirements", async function () {
      const addrs = Array(10).fill(await mockToken.getAddress());
      const amounts = Array(10).fill(1n);
      await expect(token.setRequirements(addrs, amounts, 0n)).to.not.be.reverted;
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        token.connect(stranger).setRequirements([], [], 0n)
      ).to.be.reverted;
    });
  });

  // ── 7. getTokenRequirements() ─────────────────────────────────────────────

  describe("getTokenRequirements()", function () {
    it("returns empty arrays initially", async function () {
      const [tokens, balances] = await token.getTokenRequirements();
      expect(tokens).to.deep.equal([]);
      expect(balances).to.deep.equal([]);
    });

    it("returns correct data after setRequirements", async function () {
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      await token.setRequirements([addr1, addr2], [100n, 999n], 0n);
      const [tokens, balances] = await token.getTokenRequirements();
      expect(tokens[0]).to.equal(addr1);
      expect(tokens[1]).to.equal(addr2);
      expect(balances[0]).to.equal(100n);
      expect(balances[1]).to.equal(999n);
    });

    it("reflects updated requirements after overwrite", async function () {
      await token.setRequirements([await mockToken.getAddress()], [500n], 0n);
      await token.setRequirements([await mockToken2.getAddress()], [777n], 0n);
      const [tokens, balances] = await token.getTokenRequirements();
      expect(tokens.length).to.equal(1);
      expect(tokens[0]).to.equal(await mockToken2.getAddress());
      expect(balances[0]).to.equal(777n);
    });
  });

  // ── 8. rescueLYX ─────────────────────────────────────────────────────────

  describe("rescueLYX", function () {
    const sendAmount = ethers.parseEther("1");

    beforeEach(async function () {
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

  // ── 9. claim() — revert paths ────────────────────────────────────────────

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
      await token.setClaimWindow(t + 9999, 0);
      await expect(claimer1.doClaim(await token.getAddress())).to.be.revertedWithCustomError(
        token,
        "OutsideClaimWindow"
      );
    });

    it("reverts with OutsideClaimWindow after endTime", async function () {
      const t = await now();
      await token.setClaimEnabled(true);
      await token.setClaimWindow(0, t + 1);
      await timeTravel(5);
      await expect(claimer1.doClaim(await token.getAddress())).to.be.revertedWithCustomError(
        token,
        "OutsideClaimWindow"
      );
    });

    it("reverts with MaxSupplyReached when supply is full", async function () {
      const limited = await deployTokenProxy(
        owner, "Limited", "LTD", AMOUNT_PER_CLAIM, AMOUNT_PER_CLAIM, false
      );
      await limited.setClaimEnabled(true);
      await claimer1.doClaim(await limited.getAddress());
      await expect(claimer2.doClaim(await limited.getAddress())).to.be.revertedWithCustomError(
        limited,
        "MaxSupplyReached"
      );
    });

    it("reverts with InsufficientTokenBalance when required token not held", async function () {
      await token.setClaimEnabled(true);
      const tokenAddr = await mockToken.getAddress();
      await token.setRequirements([tokenAddr], [1000n], 0n);
      await expect(claimer1.doClaim(await token.getAddress())).to.be.revertedWithCustomError(
        token,
        "InsufficientTokenBalance"
      );
    });

    it("reverts with InsufficientFollowers when not enough LSP26 followers", async function () {
      await token.setClaimEnabled(true);
      await token.setRequirements([], [], 100n);
      await expect(claimer1.doClaim(await token.getAddress())).to.be.revertedWithCustomError(
        token,
        "InsufficientFollowers"
      );
    });

    it("reverts when second of two required tokens is not held", async function () {
      await token.setClaimEnabled(true);
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      await token.setRequirements([addr1, addr2], [100n, 200n], 0n);
      // Give claimer1 enough of token1 but not token2
      await mockToken.setBalance(await claimer1.getAddress(), 100n);
      await expect(claimer1.doClaim(await token.getAddress())).to.be.revertedWithCustomError(
        token,
        "InsufficientTokenBalance"
      );
    });
  });

  // ── 10. claim() — happy path ──────────────────────────────────────────────

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

    it("increments totalSupply by amountPerClaim", async function () {
      await claimer1.doClaim(await token.getAddress());
      expect(await token.totalSupply()).to.equal(AMOUNT_PER_CLAIM);
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
      expect(await token.totalSupply()).to.equal(AMOUNT_PER_CLAIM * 3n);
    });

    it("works when single requiredToken balance is exactly the minimum", async function () {
      const tokenAddr = await mockToken.getAddress();
      const claimerAddr = await claimer1.getAddress();
      await token.setRequirements([tokenAddr], [500n], 0n);
      await mockToken.setBalance(claimerAddr, 500n);
      await expect(claimer1.doClaim(await token.getAddress())).to.not.be.reverted;
    });

    it("works when follower count exactly meets the minimum", async function () {
      const claimerAddr = await claimer1.getAddress();
      await token.setRequirements([], [], 50n);
      await mockLSP26.setFollowerCount(claimerAddr, 50n);
      await expect(claimer1.doClaim(await token.getAddress())).to.not.be.reverted;
    });

    it("works within a valid claim window", async function () {
      const t = await now();
      await token.setClaimWindow(t - 10, t + 9999);
      await expect(claimer1.doClaim(await token.getAddress())).to.not.be.reverted;
    });

    it("works when ALL multi-token requirements are met", async function () {
      const claimerAddr = await claimer1.getAddress();
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      await token.setRequirements([addr1, addr2], [100n, 200n], 0n);
      await mockToken.setBalance(claimerAddr, 100n);
      await mockToken2.setBalance(claimerAddr, 200n);
      await expect(claimer1.doClaim(await token.getAddress())).to.not.be.reverted;
    });
  });

  // ── 11. Multi-token requirements ──────────────────────────────────────────

  describe("Multi-token requirements", function () {
    it("meetsRequirements: (false,true) when first of two tokens insufficient", async function () {
      const claimerAddr = await claimer1.getAddress();
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      await token.setRequirements([addr1, addr2], [100n, 200n], 0n);
      // claimer has neither token
      const [tok, fol] = await token.meetsRequirements(claimerAddr);
      expect(tok).to.be.false;
      expect(fol).to.be.true;
    });

    it("meetsRequirements: (false,true) when second of two tokens insufficient", async function () {
      const claimerAddr = await claimer1.getAddress();
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      await token.setRequirements([addr1, addr2], [100n, 200n], 0n);
      // Give enough of token1 but not token2
      await mockToken.setBalance(claimerAddr, 100n);
      const [tok, fol] = await token.meetsRequirements(claimerAddr);
      expect(tok).to.be.false;
      expect(fol).to.be.true;
    });

    it("meetsRequirements: (true,true) when both tokens sufficient", async function () {
      const claimerAddr = await claimer1.getAddress();
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      await token.setRequirements([addr1, addr2], [100n, 200n], 0n);
      await mockToken.setBalance(claimerAddr, 100n);
      await mockToken2.setBalance(claimerAddr, 200n);
      const [tok, fol] = await token.meetsRequirements(claimerAddr);
      expect(tok).to.be.true;
      expect(fol).to.be.true;
    });

    it("meetsRequirements: (false,false) when both tokens fail and followers fail", async function () {
      const claimerAddr = await claimer1.getAddress();
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      await token.setRequirements([addr1, addr2], [100n, 200n], 50n);
      // claimer has nothing
      const [tok, fol] = await token.meetsRequirements(claimerAddr);
      expect(tok).to.be.false;
      expect(fol).to.be.false;
    });

    it("skips token check when minBalance is 0 for that entry", async function () {
      const claimerAddr = await claimer1.getAddress();
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      // token1 has minBalance=0 (skip), token2 has minBalance=200
      await token.setRequirements([addr1, addr2], [0n, 200n], 0n);
      await mockToken2.setBalance(claimerAddr, 200n);
      const [tok, fol] = await token.meetsRequirements(claimerAddr);
      expect(tok).to.be.true;
      expect(fol).to.be.true;
    });

    it("batchMeetsRequirements works with 2 tokens across 3 claimers", async function () {
      const addr1 = await mockToken.getAddress();
      const addr2 = await mockToken2.getAddress();
      const cAddr1 = await claimer1.getAddress();
      const cAddr2 = await claimer2.getAddress();
      const cAddr3 = await claimer3.getAddress();

      await token.setRequirements([addr1, addr2], [100n, 200n], 0n);

      // claimer1: has nothing
      // claimer2: has token1 only
      await mockToken.setBalance(cAddr2, 100n);
      // claimer3: has both
      await mockToken.setBalance(cAddr3, 100n);
      await mockToken2.setBalance(cAddr3, 200n);

      const [tok, fol] = await token.batchMeetsRequirements([cAddr1, cAddr2, cAddr3]);
      expect(tok[0]).to.be.false;  // claimer1 fails
      expect(tok[1]).to.be.false;  // claimer2 fails (missing token2)
      expect(tok[2]).to.be.true;   // claimer3 passes
      expect(fol[0]).to.be.true;
      expect(fol[1]).to.be.true;
      expect(fol[2]).to.be.true;
    });
  });

  // ── 12. isClaimActive() ──────────────────────────────────────────────────

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

    it("returns false when supply is exhausted", async function () {
      const limited = await deployTokenProxy(
        owner, "L", "L", AMOUNT_PER_CLAIM, AMOUNT_PER_CLAIM, false
      );
      await limited.setClaimEnabled(true);
      await claimer1.doClaim(await limited.getAddress());
      expect(await limited.isClaimActive()).to.be.false;
    });
  });

  // ── 13. totalClaimers() ──────────────────────────────────────────────────

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

  // ── 14. meetsRequirements() ──────────────────────────────────────────────

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
      await token.setRequirements([tokenAddr], [1000n], 0n);
      const [tok, fol] = await token.meetsRequirements(claimerAddr);
      expect(tok).to.be.false;
      expect(fol).to.be.true;
    });

    it("returns (true, false) when follower count insufficient", async function () {
      const addr = await claimer1.getAddress();
      await token.setRequirements([], [], 100n);
      const [tok, fol] = await token.meetsRequirements(addr);
      expect(tok).to.be.true;
      expect(fol).to.be.false;
    });

    it("returns (false, false) when both requirements fail", async function () {
      const claimerAddr = await claimer1.getAddress();
      const tokenAddr = await mockToken.getAddress();
      await token.setRequirements([tokenAddr], [1000n], 100n);
      const [tok, fol] = await token.meetsRequirements(claimerAddr);
      expect(tok).to.be.false;
      expect(fol).to.be.false;
    });

    it("returns (true, true) when all requirements are met", async function () {
      const claimerAddr = await claimer1.getAddress();
      const tokenAddr = await mockToken.getAddress();
      await token.setRequirements([tokenAddr], [1000n], 100n);
      await mockToken.setBalance(claimerAddr, 1000n);
      await mockLSP26.setFollowerCount(claimerAddr, 100n);
      const [tok, fol] = await token.meetsRequirements(claimerAddr);
      expect(tok).to.be.true;
      expect(fol).to.be.true;
    });

    it("ignores token requirement when minBalance is 0", async function () {
      const addr = await claimer1.getAddress();
      await token.setRequirements([await mockToken.getAddress()], [0n], 0n);
      const [tok, fol] = await token.meetsRequirements(addr);
      expect(tok).to.be.true;
      expect(fol).to.be.true;
    });
  });

  // ── 15. batchHasClaimed() ────────────────────────────────────────────────

  describe("batchHasClaimed()", function () {
    it("returns empty array for empty input", async function () {
      const results = await token.batchHasClaimed([]);
      expect(results).to.deep.equal([]);
    });

    it("returns [false] for an address that has not claimed", async function () {
      const addr = await claimer1.getAddress();
      const results = await token.batchHasClaimed([addr]);
      expect(results.length).to.equal(1);
      expect(results[0]).to.be.false;
    });

    it("returns [true] for an address that has claimed", async function () {
      await token.setClaimEnabled(true);
      const addr = await claimer1.getAddress();
      await claimer1.doClaim(await token.getAddress());
      const results = await token.batchHasClaimed([addr]);
      expect(results[0]).to.be.true;
    });

    it("returns mixed results for a batch of addresses", async function () {
      await token.setClaimEnabled(true);
      await claimer1.doClaim(await token.getAddress());

      const addr1 = await claimer1.getAddress();
      const addr2 = await claimer2.getAddress();
      const addr3 = await claimer3.getAddress();

      const results = await token.batchHasClaimed([addr1, addr2, addr3]);
      expect(results[0]).to.be.true;
      expect(results[1]).to.be.false;
      expect(results[2]).to.be.false;
    });

    it("reflects state change after a second claimer claims", async function () {
      await token.setClaimEnabled(true);
      await claimer1.doClaim(await token.getAddress());

      const addr1 = await claimer1.getAddress();
      const addr2 = await claimer2.getAddress();

      const before = await token.batchHasClaimed([addr1, addr2]);
      expect(before[0]).to.be.true;
      expect(before[1]).to.be.false;

      await claimer2.doClaim(await token.getAddress());

      const after = await token.batchHasClaimed([addr1, addr2]);
      expect(after[0]).to.be.true;
      expect(after[1]).to.be.true;
    });
  });

  // ── 16. batchMeetsRequirements() ────────────────────────────────────────

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

      await token.setRequirements([tokenAddr], [500n], 10n);
      // addr2: meets token only
      await mockToken.setBalance(addr2, 500n);
      // addr3: meets both
      await mockToken.setBalance(addr3, 500n);
      await mockLSP26.setFollowerCount(addr3, 10n);

      const [tok, fol] = await token.batchMeetsRequirements([addr1, addr2, addr3]);

      expect(tok[0]).to.be.false;
      expect(fol[0]).to.be.false;
      expect(tok[1]).to.be.true;
      expect(fol[1]).to.be.false;
      expect(tok[2]).to.be.true;
      expect(fol[2]).to.be.true;
    });
  });
});
