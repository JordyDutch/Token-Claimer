// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {
    LSP7DigitalAssetInitAbstract
} from "@lukso/lsp7-contracts/contracts/LSP7DigitalAssetInitAbstract.sol";
import {
    LSP7CappedSupplyInitAbstract
} from "@lukso/lsp7-contracts/contracts/extensions/LSP7CappedSupplyInitAbstract.sol";
import {_LSP4_TOKEN_TYPE_TOKEN, _LSP4_TOKEN_TYPE_NFT} from "@lukso/lsp4-contracts/contracts/LSP4Constants.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {ILSP7Balance, ILSP26Followers} from "./ITokenClaimer.sol";

/// @title LSP7ClaimableToken
/// @author Token Claimer
/// @notice A claimable fungible token drop for LUKSO. Creators deploy this via the
///         LSP7DropFactory using EIP-1167 minimal proxies. Each wallet can claim once,
///         receiving `amountPerClaim` tokens — provided it meets the optional token-holding
///         and follower requirements.
/// @dev Designed for proxy deployment via OZ `Clones.clone()`. Inherits
///      `LSP7CappedSupplyInitAbstract` for supply cap enforcement and
///      `ReentrancyGuardUpgradeable` for reentrancy protection.
///      When unlimited supply is desired, the factory should pass `type(uint256).max`
///      as the `maxSupply_` parameter — the cap is effectively infinite.
contract LSP7ClaimableToken is LSP7CappedSupplyInitAbstract, ReentrancyGuardUpgradeable {

    // ──────────────────── Custom Errors ────────────────────

    error ClaimNotActive();
    error AlreadyClaimed();
    error OutsideClaimWindow();
    error MaxSupplyReached();
    error InsufficientTokenBalance();
    error InsufficientFollowers();
    error NotFollowingRequired();
    error RescueFailed();
    error WrongCodeword();
    error AmountPerClaimZero();
    error MaxSupplyBelowAmountPerClaim();
    error InvalidClaimWindow();
    error AmountOutOfRange();
    error AmountExceedsMaxSupply();
    error RequirementsLengthMismatch();
    error TooManyTokenRequirements();
    error ClaimEnabledNoChange();
    error AlreadyInitialized();
    /// @notice Reverts when a token requirement address has no contract code (EOA or zero address).
    error InvalidTokenRequirement();

    // ──────────────────── Storage ────────────────────

    /// @notice Whether claiming is currently enabled by the owner.
    bool public claimEnabled;

    /// @notice Unix timestamp after which claims are accepted (0 = no lower bound).
    uint256 public startTime;

    /// @notice Unix timestamp after which claims are rejected (0 = no upper bound).
    uint256 public endTime;

    /// @notice Number of tokens minted per successful claim.
    uint256 public amountPerClaim;

    /// @notice Number of unique addresses that have claimed.
    uint256 public claimerCount;

    /// @dev List of token contract addresses required for claiming.
    address[] private _reqTokens;

    /// @dev Corresponding minimum balances for each required token.
    uint256[] private _reqMinBalances;

    /// @notice Minimum LSP26 follower count a claimer must have (0 = no requirement).
    uint256 public requiredFollowers;

    /// @notice Address a claimer must follow to claim (zero address = no requirement).
    address public requiredFollowAddress;

    /// @dev LSP26 Follower System registry on LUKSO mainnet.
    address public constant LSP26_REGISTRY = 0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA;

    /// @notice Tracks whether an address has already claimed.
    /// @dev Keyed by `msg.sender`. One claim per address — not per identity.
    ///      On LUKSO, Universal Profiles are cheap to deploy, so this does not
    ///      prevent Sybil attacks without additional off-chain gating.
    mapping(address => bool) public hasClaimed;

    /// @dev keccak256 hash of the codeword (0x0 = no codeword required).
    bytes32 private _codewordHash;

    // ──────────────────── Events ────────────────────

    /// @notice Emitted when the owner enables or disables claiming.
    event ClaimToggled(bool enabled);

    /// @notice Emitted when the owner sets or changes the claim time window.
    event ClaimWindowSet(uint256 startTime, uint256 endTime);

    /// @notice Emitted when a user successfully claims tokens.
    event TokensClaimed(address indexed claimer, uint256 amount);

    /// @notice Emitted when the owner updates the claim requirements.
    /// @param tokenCount Number of token requirements set.
    /// @param followers  Minimum follower count.
    /// @param followAddress Address a claimer must follow.
    event RequirementsUpdated(uint256 tokenCount, uint256 followers, address followAddress);

    /// @notice Emitted when the owner changes the amount of tokens given per claim.
    event AmountPerClaimUpdated(uint256 newAmount);

    /// @notice Emitted when the owner rescues LYX accidentally sent to this contract.
    event LYXRescued(address indexed to, uint256 amount);

    /// @notice Emitted when the codeword requirement is updated.
    event CodewordUpdated(bool hasCodeword);

    // ──────────────────── Constructor (disabled for proxy) ────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    /// @dev Disables initializers on the implementation contract itself so it can never
    ///      be used directly. LYX sent to the implementation is unrecoverable — the
    ///      `receive()` below is inherited but `rescueLYX` is only callable post-initialize,
    ///      which is blocked by `_disableInitializers()`. Clones deploy their own storage
    ///      and call `initialize()` exactly once, so they are unaffected.
    ///      ⚠️ Do not send LYX to the implementation contract address directly.
    constructor() {
        _disableInitializers();
    }

    // ──────────────────── Initializer ────────────────────

    /// @notice Initializes the claimable token proxy. Called once by the factory after cloning.
    /// @param name_ Token name (LSP4).
    /// @param symbol_ Token symbol (LSP4).
    /// @param owner_ Address that will own this token contract.
    /// @param amountPerClaim_ Number of tokens minted per claim.
    /// @param maxSupply_ Hard cap on total supply. Pass `type(uint256).max` for unlimited.
    /// @param isNonDivisible_ If true, the token has 0 decimals.
    function initialize(
        string memory name_,
        string memory symbol_,
        address owner_,
        uint256 amountPerClaim_,
        uint256 maxSupply_,
        bool isNonDivisible_
    ) external initializer {
        // Initialize LSP7 base (name, symbol, owner, token type, divisibility)
        // Non-divisible (0 decimals) tokens get LSP4TokenType=1 (NFT) so the
        // LUKSO explorer categorises them as collectibles rather than fungible tokens.
        uint256 tokenType = isNonDivisible_ ? _LSP4_TOKEN_TYPE_NFT : _LSP4_TOKEN_TYPE_TOKEN;
        LSP7DigitalAssetInitAbstract._initialize(
            name_,
            symbol_,
            owner_,
            tokenType,
            isNonDivisible_
        );

        // Initialize CappedSupply (the cap)
        LSP7CappedSupplyInitAbstract._initialize(maxSupply_);

        // Initialize ReentrancyGuard
        __ReentrancyGuard_init();

        if (amountPerClaim_ == 0) revert AmountPerClaimZero();
        // Same upper bound as setAmountPerClaim() — 1e24 = 1,000,000 tokens at 18 decimals.
        // Prevents irreversible misconfiguration at deploy time (initialize has no upgrade path).
        if (amountPerClaim_ > 1e24) revert AmountOutOfRange();
        if (maxSupply_ != type(uint256).max && maxSupply_ < amountPerClaim_) {
            revert MaxSupplyBelowAmountPerClaim();
        }

        amountPerClaim = amountPerClaim_;
    }

    // ──────────────────── Receive ────────────────────

    /// @dev Accept LYX sent to this contract (for rescue scenarios).
    receive() external payable override {}

    // ──────────────────── Owner Controls ────────────────────

    /// @notice Enable or disable claiming. Reverts if the value is unchanged.
    /// @param enabled_ Whether claiming should be active.
    function setClaimEnabled(bool enabled_) external onlyOwner {
        if (enabled_ == claimEnabled) revert ClaimEnabledNoChange();
        claimEnabled = enabled_;
        emit ClaimToggled(enabled_);
    }

    /// @notice Set the claim time window. Pass 0 for either bound to disable it.
    /// @param start_ Unix timestamp for claim start (0 = no lower bound).
    /// @param end_ Unix timestamp for claim end (0 = no upper bound).
    function setClaimWindow(uint256 start_, uint256 end_) external onlyOwner {
        if (end_ != 0 && end_ <= start_) revert InvalidClaimWindow();
        startTime = start_;
        endTime = end_;
        emit ClaimWindowSet(start_, end_);
    }

    /// @notice Update the number of tokens minted per claim.
    /// @param amount_ New amount per claim. Must be > 0 and ≤ 1e24.
    ///        The upper bound of 1e24 (1,000,000 tokens with 18 decimals) is a sanity cap
    ///        to prevent accidental misconfiguration (e.g. passing raw ether amounts).
    ///        It is not a protocol-level supply constraint — `maxSupply` governs total supply.
    function setAmountPerClaim(uint256 amount_) external onlyOwner {
        if (amount_ == 0 || amount_ > 1e24) revert AmountOutOfRange();
        if (tokenSupplyCap() != type(uint256).max) {
            uint256 remaining = tokenSupplyCap() - totalSupply();
            if (remaining < amount_) revert AmountExceedsMaxSupply();
        }
        amountPerClaim = amount_;
        emit AmountPerClaimUpdated(amount_);
    }

    /// @notice Configures the optional token-holding and follower requirements.
    /// @param tokens_      Array of LSP7/LSP8 contract addresses claimers must hold.
    ///                     Each address MUST be a deployed contract. Passing an EOA or zero
    ///                     address will cause `balanceOf` to revert during `_checkRequirements`,
    ///                     permanently blocking all claims (DoS).
    /// @param minBalances_ Corresponding minimum balances (must equal tokens_.length).
    /// @param followers_   Minimum LSP26 follower count (0 = none).
    /// @param followAddress_ Address the claimer must follow (zero address = none).
    /// @dev ⚠️ SYBIL NOTE: Requirements are checked against `msg.sender` (the claimer address).
    ///      On LUKSO, deploying additional Universal Profiles is cheap, so a determined actor
    ///      can bypass claim-once limits via multiple addresses. Token/follower requirements
    ///      raise the cost of Sybil attacks but do not eliminate them. This is a known
    ///      limitation of address-based gating without an off-chain identity layer (e.g. KYC).
    function setRequirements(
        address[] calldata tokens_,
        uint256[] calldata minBalances_,
        uint256 followers_,
        address followAddress_
    ) external onlyOwner {
        if (tokens_.length != minBalances_.length) revert RequirementsLengthMismatch();
        if (tokens_.length > 10) revert TooManyTokenRequirements();
        delete _reqTokens;
        delete _reqMinBalances;
        for (uint256 i = 0; i < tokens_.length;) {
            address token = tokens_[i];
            // Validate that the address has contract code. A zero address or EOA would
            // cause `balanceOf` to revert during claim, permanently blocking all claims.
            uint256 codeSize;
            assembly { codeSize := extcodesize(token) }
            if (codeSize == 0) revert InvalidTokenRequirement();
            _reqTokens.push(token);
            _reqMinBalances.push(minBalances_[i]);
            unchecked { ++i; }
        }
        requiredFollowers = followers_;
        requiredFollowAddress = followAddress_;
        emit RequirementsUpdated(tokens_.length, followers_, followAddress_);
    }

    /// @notice Returns all token requirements.
    /// @return tokens      Array of required token addresses.
    /// @return minBalances Corresponding minimum balances.
    function getTokenRequirements()
        external
        view
        returns (address[] memory tokens, uint256[] memory minBalances)
    {
        return (_reqTokens, _reqMinBalances);
    }

    /// @notice Sets a codeword required to claim. Stored as a keccak256 hash — the
    ///         plaintext is never stored on-chain. Pass an empty string to clear.
    /// @param word The codeword string. Empty string removes the requirement.
    function setCodeword(string calldata word) external onlyOwner {
        if (bytes(word).length == 0) {
            _codewordHash = bytes32(0);
        } else {
            _codewordHash = keccak256(abi.encodePacked(word));
        }
        emit CodewordUpdated(_codewordHash != bytes32(0));
    }

    /// @notice Whether a codeword is currently required to claim.
    function codewordEnabled() external view returns (bool) {
        return _codewordHash != bytes32(0);
    }

    /// @notice Allows the owner to rescue LYX accidentally sent to this contract.
    /// @param to_ The recipient of the rescued LYX.
    /// @param amount_ The amount of LYX to send.
    /// @dev ⚠️ CENTRALIZATION RISK: The contract owner can withdraw any LYX held by
    ///      this contract at any time. Users should be aware that LYX sent to this
    ///      contract (e.g. as donations or by accident) is recoverable only by the owner.
    ///      This function exists as a safety valve — not as an intended withdrawal mechanism.
    function rescueLYX(address payable to_, uint256 amount_) external onlyOwner {
        (bool ok, ) = to_.call{value: amount_}("");
        if (!ok) revert RescueFailed();
        emit LYXRescued(to_, amount_);
    }

    function renounceOwnership() public pure override {
        revert("Renounce disabled");
    }

    // ──────────────────── Claim ────────────────────

    /// @notice Claim without a codeword. Reverts if a codeword is currently set.
    function claim() external {
        _doClaim("");
    }

    /// @notice Claim with a codeword. Works whether or not a codeword is set.
    /// @param codeword The codeword string to verify.
    function claimWithCode(string calldata codeword) external {
        _doClaim(codeword);
    }

    /// @dev Core claim logic. Protected by `nonReentrant` from OZ.
    /// @param codeword The codeword to verify (empty string if none required).
    function _doClaim(string memory codeword) internal nonReentrant {
        if (!claimEnabled) revert ClaimNotActive();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        if (startTime > 0 && block.timestamp < startTime) revert OutsideClaimWindow();
        if (endTime > 0 && block.timestamp > endTime) revert OutsideClaimWindow();

        // Supply cap check — CappedSupply._mint also enforces this, but we revert
        // early with our own error for better UX / frontend error decoding.
        if (totalSupply() + amountPerClaim > tokenSupplyCap()) revert MaxSupplyReached();

        // Codeword check — only if a codeword is set
        if (_codewordHash != bytes32(0)) {
            if (keccak256(abi.encodePacked(codeword)) != _codewordHash) revert WrongCodeword();
        }

        (bool tokenOk, bool followersOk, bool followOk) = _checkRequirements(msg.sender);
        if (!tokenOk) revert InsufficientTokenBalance();
        if (!followersOk) revert InsufficientFollowers();
        if (!followOk) revert NotFollowingRequired();

        hasClaimed[msg.sender] = true;
        claimerCount++;

        _mint(msg.sender, amountPerClaim, false, "");

        emit TokensClaimed(msg.sender, amountPerClaim);
    }

    // ──────────────────── Views ────────────────────

    /// @notice Returns whether claiming is currently possible (enabled, within window, supply available).
    function isClaimActive() external view returns (bool) {
        if (!claimEnabled) return false;
        if (startTime > 0 && block.timestamp < startTime) return false;
        if (endTime > 0 && block.timestamp > endTime) return false;
        if (totalSupply() + amountPerClaim > tokenSupplyCap()) return false;
        return true;
    }

    /// @notice Returns the number of unique addresses that have successfully claimed.
    function totalClaimers() external view returns (uint256) {
        return claimerCount;
    }

    /// @notice Check if an address meets the token-holding and follower requirements.
    /// @param addr The address to check.
    /// @return tokenOk Whether the address holds enough of all required tokens.
    /// @return followersOk Whether the address has enough LSP26 followers.
    /// @return followOk Whether the address follows the required profile.
    function meetsRequirements(address addr)
        external
        view
        returns (bool tokenOk, bool followersOk, bool followOk)
    {
        return _checkRequirements(addr);
    }

    /// @notice Batch check whether multiple addresses have already claimed.
    /// @param addrs Array of addresses to check.
    /// @return results Array of booleans (true = has claimed).
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

    /// @notice Batch check whether multiple addresses meet the claim requirements.
    /// @param addrs Array of addresses to check.
    /// @return tokenOk Array of booleans for token requirement.
    /// @return followersOk Array of booleans for follower requirement.
    /// @return followOk Array of booleans for required-follow requirement.
    function batchMeetsRequirements(address[] calldata addrs)
        external
        view
        returns (bool[] memory tokenOk, bool[] memory followersOk, bool[] memory followOk)
    {
        uint256 len = addrs.length;
        tokenOk = new bool[](len);
        followersOk = new bool[](len);
        followOk = new bool[](len);
        for (uint256 i = 0; i < len;) {
            (tokenOk[i], followersOk[i], followOk[i]) = _checkRequirements(addrs[i]);
            unchecked { ++i; }
        }
    }

    // ──────────────────── Internal ────────────────────

    /// @dev Checks all token requirements (ALL must pass) and follower requirement.
    /// @param addr The address to check requirements for.
    /// @return tokenOk True if the address holds enough of every required token.
    /// @return followersOk True if the address has enough LSP26 followers.
    /// @return followOk True if the address follows the required profile.
    function _checkRequirements(address addr)
        internal
        view
        returns (bool tokenOk, bool followersOk, bool followOk)
    {
        tokenOk = true;
        followersOk = true;
        followOk = true;

        uint256 len = _reqTokens.length;
        for (uint256 i = 0; i < len;) {
            if (_reqMinBalances[i] > 0) {
                if (ILSP7Balance(_reqTokens[i]).balanceOf(addr) < _reqMinBalances[i]) {
                    tokenOk = false;
                    break;
                }
            }
            unchecked { ++i; }
        }

        if (requiredFollowers > 0) {
            followersOk = ILSP26Followers(LSP26_REGISTRY).followerCount(addr) >= requiredFollowers;
        }

        if (requiredFollowAddress != address(0)) {
            followOk = ILSP26Followers(LSP26_REGISTRY).isFollowing(addr, requiredFollowAddress);
        }
    }
}
