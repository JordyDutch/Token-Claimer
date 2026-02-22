// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {LSP7DigitalAsset} from "@lukso/lsp7-contracts/contracts/LSP7DigitalAsset.sol";
import {_LSP4_TOKEN_TYPE_TOKEN} from "@lukso/lsp4-contracts/contracts/LSP4Constants.sol";
import {ILSP7Balance, ILSP26Followers} from "./ITokenClaimer.sol";

/// @title LSP7ClaimableToken
/// @author Token Claimer
/// @notice A claimable fungible token drop for LUKSO. Creators deploy this via the
///         LSP7DropFactory. Each wallet can claim once, receiving `amountPerClaim`
///         tokens — provided it meets the optional token-holding and follower requirements.
/// @dev Inherits LSP7DigitalAsset (which includes LSP14Ownable2Step for safe ownership
///      transfers). Uses a uint256 reentrancy guard (1/2 pattern) instead of a bool
///      because warm SSTORE from 1→2 costs only 100 gas vs 20 000 for 0→1.
contract LSP7ClaimableToken is LSP7DigitalAsset {

    // ──────────────────── Storage ────────────────────

    /// @notice Whether claiming is currently enabled by the owner.
    /// @dev Storage slot: packed by the compiler with other small variables.
    bool public claimEnabled;

    /// @notice Unix timestamp after which claims are accepted (0 = no lower bound).
    uint256 public startTime;

    /// @notice Unix timestamp after which claims are rejected (0 = no upper bound).
    uint256 public endTime;

    /// @notice Number of tokens minted per successful claim.
    uint256 public amountPerClaim;

    /// @notice Hard cap on total tokens that can ever be minted (0 = unlimited).
    /// @dev Immutable-by-design: there is no setter, so claimers can trust the cap.
    uint256 public maxSupply;

    /// @notice Running total of tokens minted through claims.
    uint256 public totalClaimedAmount;

    /// @notice Number of unique addresses that have claimed.
    uint256 public claimerCount;

    /// @notice Address of the LSP7/LSP8 token contract a claimer must hold (address(0) = no requirement).
    address public requiredToken;

    /// @notice Minimum balance of `requiredToken` a claimer must have.
    uint256 public requiredTokenAmount;

    /// @notice Minimum LSP26 follower count a claimer must have (0 = no requirement).
    uint256 public requiredFollowers;

    /// @dev LSP26 Follower System registry on LUKSO mainnet.
    address public constant LSP26_REGISTRY = 0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA;

    /// @notice Tracks whether an address has already claimed.
    mapping(address => bool) public hasClaimed;

    /// @dev Reentrancy guard using the 1/2 pattern. Stored as uint256 so transitions
    ///      are always warm SSTOREs (1→2 and 2→1 cost ~100 gas each, vs 20 000 for 0→1).
    uint256 private _guardStatus = 1;

    // ──────────────────── Events ────────────────────

    /// @notice Emitted when the owner enables or disables claiming.
    /// @param enabled True if claiming was enabled, false if disabled.
    event ClaimToggled(bool enabled);

    /// @notice Emitted when the owner sets or changes the claim time window.
    /// @param startTime New start timestamp (0 = immediate).
    /// @param endTime   New end timestamp (0 = no deadline).
    event ClaimWindowSet(uint256 startTime, uint256 endTime);

    /// @notice Emitted when a user successfully claims tokens.
    /// @param claimer Address that received the tokens.
    /// @param amount  Number of tokens minted.
    event TokensClaimed(address indexed claimer, uint256 amount);

    /// @notice Emitted when the owner updates the claim requirements.
    /// @param token     Required token address (address(0) = none).
    /// @param amount    Minimum required balance.
    /// @param followers Minimum follower count.
    event RequirementsUpdated(address token, uint256 amount, uint256 followers);

    /// @notice Emitted when the owner changes the amount of tokens given per claim.
    /// @param newAmount The new amount per claim.
    event AmountPerClaimUpdated(uint256 newAmount);

    /// @notice Emitted when the owner rescues LYX accidentally sent to this contract.
    /// @param to     Recipient of the rescued LYX.
    /// @param amount Amount of LYX rescued (in wei).
    event LYXRescued(address indexed to, uint256 amount);

    // ──────────────────── Errors ────────────────────

    /// @notice Thrown when claiming is disabled, outside the time window, or supply exhausted.
    error ClaimNotActive();

    /// @notice Thrown when a wallet tries to claim a second time.
    error AlreadyClaimed();

    /// @notice Thrown when the current timestamp is outside the [startTime, endTime] window.
    error OutsideClaimWindow();

    /// @notice Thrown when minting would exceed maxSupply.
    error MaxSupplyReached();

    /// @notice Thrown when the claimer doesn't hold enough of the required token.
    error InsufficientTokenBalance();

    /// @notice Thrown when the claimer doesn't have enough LSP26 followers.
    error InsufficientFollowers();

    /// @notice Thrown on reentrant calls.
    error ReentrancyGuard();

    /// @notice Thrown when a rescue transfer fails.
    error RescueFailed();

    // ──────────────────── Constructor ────────────────────

    /// @notice Deploys a new claimable LSP7 token.
    /// @param name_           Human-readable token name (stored as LSP4 metadata).
    /// @param symbol_         Ticker symbol (stored as LSP4 metadata).
    /// @param owner_          Initial owner — typically the creator's Universal Profile.
    /// @param amountPerClaim_ How many tokens each claimer receives.
    /// @param maxSupply_      Hard cap on total tokens (0 = unlimited).
    /// @param isNonDivisible_ If true the token uses 0 decimals (whole units only);
    ///                        if false it uses the standard 18 decimals.
    constructor(
        string memory name_,
        string memory symbol_,
        address owner_,
        uint256 amountPerClaim_,
        uint256 maxSupply_,
        bool isNonDivisible_
    )
        LSP7DigitalAsset(
            name_,
            symbol_,
            owner_,
            _LSP4_TOKEN_TYPE_TOKEN,
            isNonDivisible_ // true → 0 decimals, false → 18 decimals (LSP7 convention)
        )
    {
        require(amountPerClaim_ > 0, "amountPerClaim must be > 0");
        require(maxSupply_ == 0 || maxSupply_ >= amountPerClaim_, "maxSupply < amountPerClaim");
        amountPerClaim = amountPerClaim_;
        maxSupply = maxSupply_;
    }

    // ──────────────────── Receive ────────────────────

    /// @notice Allows the contract to receive LYX so it can be rescued by the owner.
    /// @dev Without this, accidental LYX transfers would revert.
    receive() external payable override {}

    // ──────────────────── Owner Controls ────────────────────

    /// @notice Enables or disables claiming globally.
    /// @param enabled_ True to allow claims, false to pause.
    function setClaimEnabled(bool enabled_) external onlyOwner {
        claimEnabled = enabled_;
        emit ClaimToggled(enabled_);
    }

    /// @notice Sets the time window during which claims are accepted.
    /// @param start_ Unix timestamp for the start (0 = no lower bound).
    /// @param end_   Unix timestamp for the end (0 = no upper bound).
    /// @dev If both are 0 the window is unrestricted. end_ must be > start_ when set.
    function setClaimWindow(uint256 start_, uint256 end_) external onlyOwner {
        require(end_ == 0 || end_ > start_, "Invalid window");
        startTime = start_;
        endTime = end_;
        emit ClaimWindowSet(start_, end_);
    }

    /// @notice Changes how many tokens are minted per claim.
    /// @param amount_ New amount (must be 1–1e24 to prevent absurd values).
    /// @dev Also enforces the maxSupply >= amount invariant established in the constructor,
    ///      preventing a misconfiguration that would make all future claims revert with
    ///      MaxSupplyReached (when maxSupply > 0 and amount > maxSupply).
    function setAmountPerClaim(uint256 amount_) external onlyOwner {
        require(amount_ > 0 && amount_ <= 1e24, "Out of range");
        require(maxSupply == 0 || maxSupply >= amount_, "Would exceed maxSupply");
        amountPerClaim = amount_;
        emit AmountPerClaimUpdated(amount_);
    }

    /// @notice Configures the optional token-holding and follower requirements.
    /// @param token_       LSP7/LSP8 contract address claimers must hold (address(0) = none).
    /// @param tokenAmount_ Minimum balance required.
    /// @param followers_   Minimum LSP26 follower count (0 = none).
    function setRequirements(
        address token_,
        uint256 tokenAmount_,
        uint256 followers_
    ) external onlyOwner {
        requiredToken = token_;
        requiredTokenAmount = tokenAmount_;
        requiredFollowers = followers_;
        emit RequirementsUpdated(token_, tokenAmount_, followers_);
    }

    /// @notice Allows the owner to rescue LYX accidentally sent to this contract.
    /// @param to_     Payable address to receive the LYX.
    /// @param amount_ Amount of LYX to send (in wei).
    function rescueLYX(address payable to_, uint256 amount_) external onlyOwner {
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, ) = to_.call{value: amount_}("");
        if (!ok) revert RescueFailed();
        emit LYXRescued(to_, amount_);
    }

    // ──────────────────── Claim ────────────────────

    /// @notice Claims tokens for msg.sender. Each address can claim exactly once.
    /// @dev Order: reentrancy guard → all checks (including external requirement calls)
    ///      → state effects → interaction (_mint). This is Checks-Effects-Interactions
    ///      with the guard set first to block reentrant paths.
    function claim() external {
        // --- Reentrancy guard (set first) ---
        if (_guardStatus != 1) revert ReentrancyGuard();
        _guardStatus = 2; // warm SSTORE: costs ~100 gas

        // --- Checks (pure state reads) ---
        if (!claimEnabled) revert ClaimNotActive();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        if (startTime > 0 && block.timestamp < startTime) revert OutsideClaimWindow();
        if (endTime > 0 && block.timestamp > endTime) revert OutsideClaimWindow();
        if (maxSupply > 0 && totalClaimedAmount + amountPerClaim > maxSupply) revert MaxSupplyReached();

        // --- Checks (external calls for requirements) ---
        (bool tokenOk, bool followersOk) = _checkRequirements(msg.sender);
        if (!tokenOk) revert InsufficientTokenBalance();
        if (!followersOk) revert InsufficientFollowers();

        // --- Effects (state mutations before any interaction) ---
        hasClaimed[msg.sender] = true;
        totalClaimedAmount += amountPerClaim;
        claimerCount++;

        // --- Interaction (mint tokens to claimer) ---
        _mint(msg.sender, amountPerClaim, false, "");

        emit TokensClaimed(msg.sender, amountPerClaim);

        // --- Release reentrancy guard ---
        _guardStatus = 1; // warm SSTORE back to sentinel
    }

    // ──────────────────── Views ────────────────────

    /// @notice Returns whether a claim would succeed right now (ignoring per-user state).
    /// @return True if claiming is enabled, within the time window, and supply remains.
    function isClaimActive() external view returns (bool) {
        if (!claimEnabled) return false;
        if (startTime > 0 && block.timestamp < startTime) return false;
        if (endTime > 0 && block.timestamp > endTime) return false;
        if (maxSupply > 0 && totalClaimedAmount + amountPerClaim > maxSupply) return false;
        return true;
    }

    /// @notice Returns the total number of unique claimers.
    /// @return The claimer count.
    function totalClaimers() external view returns (uint256) {
        return claimerCount;
    }

    /// @notice Checks if a single address meets the token-holding and follower requirements.
    /// @param addr The address to check.
    /// @return tokenOk     True if the token balance requirement is met (or not set).
    /// @return followersOk True if the follower count requirement is met (or not set).
    function meetsRequirements(address addr) external view returns (bool tokenOk, bool followersOk) {
        return _checkRequirements(addr);
    }

    /// @notice Batch-checks whether multiple addresses have already claimed.
    /// @dev Saves front-ends from making N individual `hasClaimed` RPC calls when
    ///      rendering a list of participants or checking bulk eligibility.
    /// @param addrs Array of addresses to check.
    /// @return results Array of booleans — true if the address has claimed.
    function batchHasClaimed(address[] calldata addrs)
        external
        view
        returns (bool[] memory results)
    {
        results = new bool[](addrs.length);
        for (uint256 i = 0; i < addrs.length;) {
            results[i] = hasClaimed[addrs[i]];
            unchecked { ++i; }
        }
    }

    /// @notice Batch-checks requirements for multiple addresses in a single call.
    /// @dev Useful for front-ends that want to pre-check a list of potential claimers.
    /// @param addrs Array of addresses to check.
    /// @return tokenOk     Array of booleans — true if token requirement met for each address.
    /// @return followersOk Array of booleans — true if follower requirement met for each address.
    function batchMeetsRequirements(address[] calldata addrs)
        external
        view
        returns (bool[] memory tokenOk, bool[] memory followersOk)
    {
        uint256 len = addrs.length;
        tokenOk = new bool[](len);
        followersOk = new bool[](len);
        for (uint256 i = 0; i < len;) {
            (tokenOk[i], followersOk[i]) = _checkRequirements(addrs[i]);
            unchecked { ++i; }
        }
    }

    // ──────────────────── Internal ────────────────────

    /// @dev Shared logic for checking token-holding and follower requirements.
    ///      Extracted to avoid duplicating the same external calls in `claim()` and views.
    /// @param addr The address to evaluate.
    /// @return tokenOk     Whether the token requirement is satisfied.
    /// @return followersOk Whether the follower requirement is satisfied.
    function _checkRequirements(address addr) internal view returns (bool tokenOk, bool followersOk) {
        tokenOk = true;
        followersOk = true;

        if (requiredToken != address(0) && requiredTokenAmount > 0) {
            tokenOk = ILSP7Balance(requiredToken).balanceOf(addr) >= requiredTokenAmount;
        }
        if (requiredFollowers > 0) {
            followersOk = ILSP26Followers(LSP26_REGISTRY).followerCount(addr) >= requiredFollowers;
        }
    }
}
