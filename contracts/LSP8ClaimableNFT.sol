// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {LSP8IdentifiableDigitalAsset} from "@lukso/lsp8-contracts/contracts/LSP8IdentifiableDigitalAsset.sol";
import {_LSP8_TOKENID_FORMAT_NUMBER} from "@lukso/lsp8-contracts/contracts/LSP8Constants.sol";
import {_LSP4_TOKEN_TYPE_NFT} from "@lukso/lsp4-contracts/contracts/LSP4Constants.sol";
import {ILSP7Balance, ILSP26Followers} from "./ITokenClaimer.sol";

/// @title LSP8ClaimableNFT
/// @author Token Claimer
/// @notice A claimable NFT drop for LUKSO. Creators deploy this via the
///         TokenClaimerFactory. Each wallet can claim once, receiving `amountPerClaim`
///         NFTs with auto-incrementing numeric token IDs.
/// @dev Inherits LSP8IdentifiableDigitalAsset (includes LSP14Ownable2Step).
///      Uses a uint256 reentrancy guard (1/2 pattern) for cheaper warm SSTOREs.
///      Partial claims are supported: if fewer NFTs remain than `amountPerClaim`,
///      the claimer receives whatever is left.
contract LSP8ClaimableNFT is LSP8IdentifiableDigitalAsset {

    // ──────────────────── Storage ────────────────────

    /// @notice Whether claiming is currently enabled by the owner.
    bool public claimEnabled;

    /// @notice Unix timestamp after which claims are accepted (0 = no lower bound).
    uint256 public startTime;

    /// @notice Unix timestamp after which claims are rejected (0 = no upper bound).
    uint256 public endTime;

    /// @dev Auto-incrementing token ID counter. Starts at 1 so token ID 0 is never used.
    uint256 private _nextTokenId;

    /// @notice Hard cap on total NFTs that can ever be minted (0 = unlimited).
    /// @dev Immutable-by-design: no setter exists, so claimers can trust the cap.
    uint256 public maxSupply;

    /// @notice Number of NFTs minted per successful claim.
    uint256 public amountPerClaim;

    /// @notice Address of the LSP7/LSP8 token contract a claimer must hold (address(0) = none).
    address public requiredToken;

    /// @notice Minimum balance of `requiredToken` a claimer must have.
    uint256 public requiredTokenAmount;

    /// @notice Minimum LSP26 follower count a claimer must have (0 = no requirement).
    uint256 public requiredFollowers;

    /// @dev LSP26 Follower System registry on LUKSO mainnet.
    address public constant LSP26_REGISTRY = 0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA;

    /// @notice Tracks whether an address has already claimed.
    mapping(address => bool) public hasClaimed;

    /// @dev Reentrancy guard using the 1/2 pattern. Warm SSTOREs only (~100 gas each).
    uint256 private _guardStatus = 1;

    // ──────────────────── Events ────────────────────

    /// @notice Emitted when the owner enables or disables claiming.
    /// @param enabled True if claiming was enabled, false if disabled.
    event ClaimToggled(bool enabled);

    /// @notice Emitted when the owner sets or changes the claim time window.
    /// @param startTime New start timestamp.
    /// @param endTime   New end timestamp.
    event ClaimWindowSet(uint256 startTime, uint256 endTime);

    /// @notice Emitted when a user successfully claims NFTs.
    /// @param claimer      Address that received the NFTs.
    /// @param firstTokenId The first token ID in the minted batch.
    /// @param amount       How many NFTs were minted (may be less than amountPerClaim for partial claims).
    event NFTsClaimed(address indexed claimer, uint256 firstTokenId, uint256 amount);

    /// @notice Emitted when the owner updates the claim requirements.
    /// @param token     Required token address.
    /// @param amount    Minimum required balance.
    /// @param followers Minimum follower count.
    event RequirementsUpdated(address token, uint256 amount, uint256 followers);

    /// @notice Emitted when the owner changes the amount of NFTs given per claim.
    /// @param newAmount The new amount per claim.
    event AmountPerClaimUpdated(uint256 newAmount);

    /// @notice Emitted when the owner rescues LYX accidentally sent to this contract.
    /// @param to     Recipient of the rescued LYX.
    /// @param amount Amount of LYX rescued (in wei).
    event LYXRescued(address indexed to, uint256 amount);

    // ──────────────────── Errors ────────────────────

    /// @notice Thrown when claiming is disabled or supply is exhausted.
    error ClaimNotActive();

    /// @notice Thrown when a wallet tries to claim a second time.
    error AlreadyClaimed();

    /// @notice Thrown when the current timestamp is outside the claim window.
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

    /// @notice Deploys a new claimable LSP8 NFT collection.
    /// @param name_           Human-readable collection name.
    /// @param symbol_         Ticker symbol.
    /// @param owner_          Initial owner (typically the creator's Universal Profile).
    /// @param maxSupply_      Hard cap on total NFTs (0 = unlimited).
    /// @param amountPerClaim_ NFTs minted per claim (capped at 50 to bound gas).
    constructor(
        string memory name_,
        string memory symbol_,
        address owner_,
        uint256 maxSupply_,
        uint256 amountPerClaim_
    )
        LSP8IdentifiableDigitalAsset(
            name_,
            symbol_,
            owner_,
            _LSP4_TOKEN_TYPE_NFT,
            _LSP8_TOKENID_FORMAT_NUMBER
        )
    {
        maxSupply = maxSupply_;
        require(amountPerClaim_ <= 50, "Max 50 per claim");
        amountPerClaim = amountPerClaim_ == 0 ? 1 : amountPerClaim_;
        _nextTokenId = 1; // token IDs start at 1
    }

    // ──────────────────── Receive ────────────────────

    /// @notice Allows the contract to receive LYX so it can be rescued by the owner.
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
    function setClaimWindow(uint256 start_, uint256 end_) external onlyOwner {
        require(end_ == 0 || end_ > start_, "Invalid window");
        startTime = start_;
        endTime = end_;
        emit ClaimWindowSet(start_, end_);
    }

    /// @notice Changes how many NFTs are minted per claim.
    /// @param amount_ New amount (must be 1–50).
    function setAmountPerClaim(uint256 amount_) external onlyOwner {
        require(amount_ > 0 && amount_ <= 50, "Must be 1-50");
        amountPerClaim = amount_;
        emit AmountPerClaimUpdated(amount_);
    }

    /// @notice Configures the optional token-holding and follower requirements.
    /// @param token_       LSP7/LSP8 contract claimers must hold (address(0) = none).
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
        (bool ok, ) = to_.call{value: amount_}("");
        if (!ok) revert RescueFailed();
        emit LYXRescued(to_, amount_);
    }

    // ──────────────────── Claim ────────────────────

    /// @notice Claims NFTs for msg.sender. Each address can claim exactly once.
    /// @dev Supports partial claims: if fewer NFTs remain than amountPerClaim,
    ///      the claimer gets whatever is left instead of reverting.
    function claim() external {
        // --- Reentrancy guard (set first) ---
        if (_guardStatus != 1) revert ReentrancyGuard();
        _guardStatus = 2;

        // --- Checks (pure state reads) ---
        if (!claimEnabled) revert ClaimNotActive();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        if (startTime > 0 && block.timestamp < startTime) revert OutsideClaimWindow();
        if (endTime > 0 && block.timestamp > endTime) revert OutsideClaimWindow();

        // Calculate actual mint amount (partial claim at supply boundary)
        uint256 toMint = amountPerClaim;
        if (maxSupply > 0) {
            uint256 remaining = maxSupply >= _nextTokenId ? maxSupply - _nextTokenId + 1 : 0;
            if (remaining == 0) revert MaxSupplyReached();
            if (remaining < toMint) toMint = remaining; // partial claim: mint what's left
        }

        // --- Checks (external calls for requirements) ---
        (bool tokenOk, bool followersOk) = _checkRequirements(msg.sender);
        if (!tokenOk) revert InsufficientTokenBalance();
        if (!followersOk) revert InsufficientFollowers();

        // --- Effects (all state mutations completed before any interaction) ---
        hasClaimed[msg.sender] = true;
        uint256 firstId = _nextTokenId;
        _nextTokenId += toMint; // advance counter fully before minting (strict CEI)

        // --- Interaction (mint NFTs to claimer) ---
        for (uint256 i = 0; i < toMint; i++) {
            _mint(msg.sender, bytes32(firstId + i), false, "");
        }

        emit NFTsClaimed(msg.sender, firstId, toMint);

        // --- Release reentrancy guard ---
        _guardStatus = 1;
    }

    // ──────────────────── Views ────────────────────

    /// @notice Returns the next token ID that will be minted.
    /// @return The next token ID.
    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    /// @notice Returns whether a claim would succeed right now (ignoring per-user state).
    /// @dev Returns false when remaining supply is 0, even though partial claims are
    ///      supported. This is because "active" means at least one NFT can be minted.
    /// @return True if claiming is enabled, within the time window, and supply remains.
    function isClaimActive() external view returns (bool) {
        if (!claimEnabled) return false;
        if (startTime > 0 && block.timestamp < startTime) return false;
        if (endTime > 0 && block.timestamp > endTime) return false;
        if (maxSupply > 0) {
            // Check if any supply remains at all (not just amountPerClaim worth)
            uint256 remaining = maxSupply >= _nextTokenId ? maxSupply - _nextTokenId + 1 : 0;
            if (remaining == 0) return false;
        }
        return true;
    }

    /// @notice Returns the total number of NFTs minted so far.
    /// @return The count of minted NFTs.
    function totalClaimed() external view returns (uint256) {
        return _nextTokenId - 1;
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
    ///      rendering participant lists or eligibility checks in bulk.
    /// @param addrs Array of addresses to check.
    /// @return results Array of booleans — true if the address has claimed.
    function batchHasClaimed(address[] calldata addrs)
        external
        view
        returns (bool[] memory results)
    {
        results = new bool[](addrs.length);
        for (uint256 i = 0; i < addrs.length; i++) {
            results[i] = hasClaimed[addrs[i]];
        }
    }

    /// @notice Batch-checks requirements for multiple addresses in a single call.
    /// @param addrs Array of addresses to check.
    /// @return tokenOk     Array of booleans for token requirement.
    /// @return followersOk Array of booleans for follower requirement.
    function batchMeetsRequirements(address[] calldata addrs)
        external
        view
        returns (bool[] memory tokenOk, bool[] memory followersOk)
    {
        uint256 len = addrs.length;
        tokenOk = new bool[](len);
        followersOk = new bool[](len);
        for (uint256 i = 0; i < len; i++) {
            (tokenOk[i], followersOk[i]) = _checkRequirements(addrs[i]);
        }
    }

    // ──────────────────── Internal ────────────────────

    /// @dev Shared requirement checking logic used by claim(), meetsRequirements(),
    ///      and batchMeetsRequirements() to avoid code duplication.
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
