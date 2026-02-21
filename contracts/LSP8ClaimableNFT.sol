// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {LSP8IdentifiableDigitalAsset} from "@lukso/lsp8-contracts/contracts/LSP8IdentifiableDigitalAsset.sol";
import {_LSP8_TOKENID_FORMAT_NUMBER} from "@lukso/lsp8-contracts/contracts/LSP8Constants.sol";
import {_LSP4_TOKEN_TYPE_NFT} from "@lukso/lsp4-contracts/contracts/LSP4Constants.sol";

interface ILSP7Balance {
    function balanceOf(address account) external view returns (uint256);
}

interface ILSP8Balance {
    function balanceOf(address account) external view returns (uint256);
}

interface ILSP26Followers {
    function followerCount(address addr) external view returns (uint256);
}

/**
 * @title LSP8ClaimableNFT
 * @notice Claimable NFT drop for LUKSO with optional requirements:
 *         - Hold X amount of an LSP7 token
 *         - Hold X amount of an LSP8 NFT
 *         - Have X followers (LSP26)
 */
contract LSP8ClaimableNFT is LSP8IdentifiableDigitalAsset {
    bool public claimEnabled;
    uint256 public startTime;
    uint256 public endTime;
    uint256 private _nextTokenId;
    uint256 public maxSupply;
    uint256 public amountPerClaim;

    // --- Requirements ---
    address public requiredToken;        // LSP7 or LSP8 contract (address(0) = no requirement)
    uint256 public requiredTokenAmount;  // min balance needed
    uint256 public requiredFollowers;    // min follower count (0 = no requirement)

    address public constant LSP26_REGISTRY = 0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA;

    mapping(address => bool) public hasClaimed;

    event ClaimToggled(bool enabled);
    event ClaimWindowSet(uint256 startTime, uint256 endTime);
    event NFTsClaimed(address indexed claimer, uint256 firstTokenId, uint256 amount);
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
        _nextTokenId = 1;
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
        require(amount_ > 0 && amount_ <= 50, "Must be 1-50");
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
        if (maxSupply > 0 && _nextTokenId + amountPerClaim - 1 > maxSupply) revert MaxSupplyReached();

        // Token requirement check
        if (requiredToken != address(0) && requiredTokenAmount > 0) {
            uint256 bal = ILSP7Balance(requiredToken).balanceOf(msg.sender);
            if (bal < requiredTokenAmount) revert InsufficientTokenBalance();
        }

        // Follower requirement check
        if (requiredFollowers > 0) {
            uint256 followers = ILSP26Followers(LSP26_REGISTRY).followerCount(msg.sender);
            if (followers < requiredFollowers) revert InsufficientFollowers();
        }

        hasClaimed[msg.sender] = true;
        uint256 firstId = _nextTokenId;

        for (uint256 i = 0; i < amountPerClaim; i++) {
            bytes32 tokenId = bytes32(_nextTokenId);
            _nextTokenId++;
            _mint(msg.sender, tokenId, false, "");
        }

        emit NFTsClaimed(msg.sender, firstId, amountPerClaim);
    }

    // --- Views ---

    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    function isClaimActive() external view returns (bool) {
        if (!claimEnabled) return false;
        if (startTime > 0 && block.timestamp < startTime) return false;
        if (endTime > 0 && block.timestamp > endTime) return false;
        if (maxSupply > 0 && _nextTokenId + amountPerClaim - 1 > maxSupply) return false;
        return true;
    }

    function totalClaimed() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /// @notice Check if an address meets all requirements
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
