// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {LSP7DigitalAsset} from "@lukso/lsp7-contracts/contracts/LSP7DigitalAsset.sol";
import {_LSP4_TOKEN_TYPE_TOKEN} from "@lukso/lsp4-contracts/contracts/LSP4Constants.sol";

interface ILSP7Balance {
    function balanceOf(address account) external view returns (uint256);
}

interface ILSP26Followers {
    function followerCount(address addr) external view returns (uint256);
}

/**
 * @title LSP7ClaimableToken
 * @notice Claimable fungible token drop for LUKSO with optional requirements:
 *         - Hold X amount of an LSP7/LSP8 token
 *         - Have X followers (LSP26)
 */
contract LSP7ClaimableToken is LSP7DigitalAsset {
    bool public claimEnabled;
    uint256 public startTime;
    uint256 public endTime;
    uint256 public amountPerClaim;
    uint256 public maxSupply;
    uint256 public totalClaimedAmount;
    uint256 public claimerCount;

    address public requiredToken;
    uint256 public requiredTokenAmount;
    uint256 public requiredFollowers;

    address public constant LSP26_REGISTRY = 0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA;

    mapping(address => bool) public hasClaimed;

    event ClaimToggled(bool enabled);
    event ClaimWindowSet(uint256 startTime, uint256 endTime);
    event TokensClaimed(address indexed claimer, uint256 amount);
    event RequirementsUpdated(address token, uint256 amount, uint256 followers);

    error ClaimNotActive();
    error AlreadyClaimed();
    error OutsideClaimWindow();
    error MaxSupplyReached();
    error InsufficientTokenBalance();
    error InsufficientFollowers();

    constructor(
        string memory name_,
        string memory symbol_,
        address owner_,
        uint256 amountPerClaim_,
        uint256 maxSupply_,
        uint8 decimals_
    )
        LSP7DigitalAsset(
            name_,
            symbol_,
            owner_,
            _LSP4_TOKEN_TYPE_TOKEN,
            decimals_ == 0 ? true : false
        )
    {
        amountPerClaim = amountPerClaim_;
        maxSupply = maxSupply_;
    }

    // --- Owner Controls ---

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
        require(amount_ > 0, "Must be > 0");
        amountPerClaim = amount_;
    }

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

    // --- Claim ---

    function claim() external {
        if (!claimEnabled) revert ClaimNotActive();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        if (startTime > 0 && block.timestamp < startTime) revert OutsideClaimWindow();
        if (endTime > 0 && block.timestamp > endTime) revert OutsideClaimWindow();
        if (maxSupply > 0 && totalClaimedAmount + amountPerClaim > maxSupply) revert MaxSupplyReached();

        if (requiredToken != address(0) && requiredTokenAmount > 0) {
            uint256 bal = ILSP7Balance(requiredToken).balanceOf(msg.sender);
            if (bal < requiredTokenAmount) revert InsufficientTokenBalance();
        }

        if (requiredFollowers > 0) {
            uint256 followers = ILSP26Followers(LSP26_REGISTRY).followerCount(msg.sender);
            if (followers < requiredFollowers) revert InsufficientFollowers();
        }

        hasClaimed[msg.sender] = true;
        totalClaimedAmount += amountPerClaim;
        claimerCount++;

        _mint(msg.sender, amountPerClaim, false, "");

        emit TokensClaimed(msg.sender, amountPerClaim);
    }

    // --- Views ---

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
