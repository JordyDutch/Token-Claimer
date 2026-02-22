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
    bool public claimEnabled;

    /// @notice Unix timestamp after which claims are accepted (0 = no lower bound).
    uint256 public startTime;

    /// @notice Unix timestamp after which claims are rejected (0 = no upper bound).
    uint256 public endTime;

    /// @notice Number of tokens minted per successful claim.
    uint256 public amountPerClaim;

    /// @notice Hard cap on total tokens that can ever be minted (0 = unlimited).
    uint256 public maxSupply;

    /// @notice Running total of tokens minted through claims.
    uint256 public totalClaimedAmount;

    /// @notice Number of unique addresses that have claimed.
    uint256 public claimerCount;

    /// @dev List of token contract addresses required for claiming.
    address[] private _reqTokens;

    /// @dev Corresponding minimum balances for each required token.
    uint256[] private _reqMinBalances;

    /// @notice Minimum LSP26 follower count a claimer must have (0 = no requirement).
    uint256 public requiredFollowers;

    /// @dev LSP26 Follower System registry on LUKSO mainnet.
    address public constant LSP26_REGISTRY = 0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA;

    /// @notice Tracks whether an address has already claimed.
    mapping(address => bool) public hasClaimed;

    /// @dev Reentrancy guard using the 1/2 pattern.
    uint256 private _guardStatus = 1;

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
    event RequirementsUpdated(uint256 tokenCount, uint256 followers);

    /// @notice Emitted when the owner changes the amount of tokens given per claim.
    event AmountPerClaimUpdated(uint256 newAmount);

    /// @notice Emitted when the owner rescues LYX accidentally sent to this contract.
    event LYXRescued(address indexed to, uint256 amount);

    // ──────────────────── Errors ────────────────────

    error ClaimNotActive();
    error AlreadyClaimed();
    error OutsideClaimWindow();
    error MaxSupplyReached();
    error InsufficientTokenBalance();
    error InsufficientFollowers();
    error ReentrancyGuard();
    error RescueFailed();

    // ──────────────────── Constructor ────────────────────

    /// @notice Deploys a new claimable LSP7 token.
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
            isNonDivisible_
        )
    {
        require(amountPerClaim_ > 0, "amountPerClaim must be > 0");
        require(maxSupply_ == 0 || maxSupply_ >= amountPerClaim_, "maxSupply < amountPerClaim");
        amountPerClaim = amountPerClaim_;
        maxSupply = maxSupply_;
    }

    // ──────────────────── Receive ────────────────────

    receive() external payable override {}

    // ──────────────────── Owner Controls ────────────────────

    function setClaimEnabled(bool enabled_) external onlyOwner {
        claimEnabled = enabled_;
        emit ClaimToggled(enabled_);
    }

    function setClaimWindow(uint256 start_, uint256 end_) external onlyOwner {
        require(end_ == 0 || end_ > start_, "Invalid window");
        startTime = start_;
        endTime = end_;
        emit ClaimWindowSet(start_, end_);
    }

    function setAmountPerClaim(uint256 amount_) external onlyOwner {
        require(amount_ > 0 && amount_ <= 1e24, "Out of range");
        require(maxSupply == 0 || maxSupply >= amount_, "Would exceed maxSupply");
        amountPerClaim = amount_;
        emit AmountPerClaimUpdated(amount_);
    }

    /// @notice Configures the optional token-holding and follower requirements.
    /// @param tokens_      Array of LSP7/LSP8 contract addresses claimers must hold.
    /// @param minBalances_ Corresponding minimum balances (must equal tokens_.length).
    /// @param followers_   Minimum LSP26 follower count (0 = none).
    function setRequirements(
        address[] calldata tokens_,
        uint256[] calldata minBalances_,
        uint256 followers_
    ) external onlyOwner {
        require(tokens_.length == minBalances_.length, "Length mismatch");
        require(tokens_.length <= 10, "Max 10 token requirements");
        delete _reqTokens;
        delete _reqMinBalances;
        for (uint256 i = 0; i < tokens_.length;) {
            _reqTokens.push(tokens_[i]);
            _reqMinBalances.push(minBalances_[i]);
            unchecked { ++i; }
        }
        requiredFollowers = followers_;
        emit RequirementsUpdated(tokens_.length, followers_);
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

    function rescueLYX(address payable to_, uint256 amount_) external onlyOwner {
        (bool ok, ) = to_.call{value: amount_}("");
        if (!ok) revert RescueFailed();
        emit LYXRescued(to_, amount_);
    }

    // ──────────────────── Claim ────────────────────

    function claim() external {
        if (_guardStatus != 1) revert ReentrancyGuard();
        _guardStatus = 2;

        if (!claimEnabled) revert ClaimNotActive();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        if (startTime > 0 && block.timestamp < startTime) revert OutsideClaimWindow();
        if (endTime > 0 && block.timestamp > endTime) revert OutsideClaimWindow();
        if (maxSupply > 0 && totalClaimedAmount + amountPerClaim > maxSupply) revert MaxSupplyReached();

        (bool tokenOk, bool followersOk) = _checkRequirements(msg.sender);
        if (!tokenOk) revert InsufficientTokenBalance();
        if (!followersOk) revert InsufficientFollowers();

        hasClaimed[msg.sender] = true;
        totalClaimedAmount += amountPerClaim;
        claimerCount++;

        _mint(msg.sender, amountPerClaim, false, "");

        emit TokensClaimed(msg.sender, amountPerClaim);

        _guardStatus = 1;
    }

    // ──────────────────── Views ────────────────────

    function isClaimActive() external view returns (bool) {
        if (!claimEnabled) return false;
        if (startTime > 0 && block.timestamp < startTime) return false;
        if (endTime > 0 && block.timestamp > endTime) return false;
        if (maxSupply > 0 && totalClaimedAmount + amountPerClaim > maxSupply) return false;
        return true;
    }

    function totalClaimers() external view returns (uint256) {
        return claimerCount;
    }

    function meetsRequirements(address addr) external view returns (bool tokenOk, bool followersOk) {
        return _checkRequirements(addr);
    }

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

    /// @dev Checks all token requirements (ALL must pass) and follower requirement.
    function _checkRequirements(address addr) internal view returns (bool tokenOk, bool followersOk) {
        tokenOk = true;
        followersOk = true;

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
    }
}
