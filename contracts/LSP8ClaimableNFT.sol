// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {LSP8IdentifiableDigitalAsset} from "@lukso/lsp8-contracts/contracts/LSP8IdentifiableDigitalAsset.sol";
import {_LSP8_TOKENID_FORMAT_NUMBER} from "@lukso/lsp8-contracts/contracts/LSP8Constants.sol";
import {_LSP4_TOKEN_TYPE_NFT} from "@lukso/lsp4-contracts/contracts/LSP4Constants.sol";

/**
 * @title LSP8ClaimableNFT
 * @notice A claimable NFT drop for LUKSO — designed for artists, livestreams, and events.
 *
 * Features:
 * - On/off toggle (owner only)
 * - Optional time window (startTime / endTime)
 * - One claim per Universal Profile
 * - Gasless via LSP25 relay (frontend handles this)
 */
contract LSP8ClaimableNFT is LSP8IdentifiableDigitalAsset {
    // --- State ---
    bool public claimEnabled;
    uint256 public startTime;
    uint256 public endTime; // 0 = no end time
    uint256 private _nextTokenId;
    uint256 public maxSupply; // 0 = unlimited

    mapping(address => bool) public hasClaimed;

    // --- Events ---
    event ClaimToggled(bool enabled);
    event ClaimWindowSet(uint256 startTime, uint256 endTime);
    event NFTClaimed(address indexed claimer, bytes32 tokenId);

    // --- Errors ---
    error ClaimNotActive();
    error AlreadyClaimed();
    error OutsideClaimWindow();
    error MaxSupplyReached();

    constructor(
        string memory name_,
        string memory symbol_,
        address owner_,
        uint256 maxSupply_
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

    // --- Claim ---

    function claim() external {
        if (!claimEnabled) revert ClaimNotActive();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();

        if (startTime > 0 && block.timestamp < startTime) revert OutsideClaimWindow();
        if (endTime > 0 && block.timestamp > endTime) revert OutsideClaimWindow();

        if (maxSupply > 0 && _nextTokenId > maxSupply) revert MaxSupplyReached();

        hasClaimed[msg.sender] = true;
        bytes32 tokenId = bytes32(_nextTokenId);
        _nextTokenId++;

        // force=false: only mint to UPs with LSP1 (safe default for LUKSO)
        _mint(msg.sender, tokenId, false, "");

        emit NFTClaimed(msg.sender, tokenId);
    }

    // --- Views ---

    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    function isClaimActive() external view returns (bool) {
        if (!claimEnabled) return false;
        if (startTime > 0 && block.timestamp < startTime) return false;
        if (endTime > 0 && block.timestamp > endTime) return false;
        if (maxSupply > 0 && _nextTokenId > maxSupply) return false;
        return true;
    }

    function totalClaimed() external view returns (uint256) {
        return _nextTokenId - 1;
    }
}
