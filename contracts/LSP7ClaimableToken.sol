// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {LSP7DigitalAsset} from "@lukso/lsp7-contracts/contracts/LSP7DigitalAsset.sol";
import {_LSP4_TOKEN_TYPE_TOKEN} from "@lukso/lsp4-contracts/contracts/LSP4Constants.sol";

/**
 * @title LSP7ClaimableToken
 * @notice A claimable fungible token drop for LUKSO.
 *         Each Universal Profile can claim a fixed amount once.
 *
 * Features:
 * - On/off toggle (owner only)
 * - Optional time window (startTime / endTime)
 * - One claim per Universal Profile
 * - Configurable amount per claim (e.g. 100, 1_000_000)
 * - Optional max total supply
 */
contract LSP7ClaimableToken is LSP7DigitalAsset {
    bool public claimEnabled;
    uint256 public startTime;
    uint256 public endTime;
    uint256 public amountPerClaim;
    uint256 public maxSupply; // 0 = unlimited
    uint256 public totalClaimedAmount;

    mapping(address => bool) public hasClaimed;

    event ClaimToggled(bool enabled);
    event ClaimWindowSet(uint256 startTime, uint256 endTime);
    event TokensClaimed(address indexed claimer, uint256 amount);

    error ClaimNotActive();
    error AlreadyClaimed();
    error OutsideClaimWindow();
    error MaxSupplyReached();

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
            decimals_ == 0 ? false : true
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
        amountPerClaim = amount_;
    }

    // --- Claim ---

    function claim() external {
        if (!claimEnabled) revert ClaimNotActive();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        if (startTime > 0 && block.timestamp < startTime) revert OutsideClaimWindow();
        if (endTime > 0 && block.timestamp > endTime) revert OutsideClaimWindow();
        if (maxSupply > 0 && totalClaimedAmount + amountPerClaim > maxSupply) revert MaxSupplyReached();

        hasClaimed[msg.sender] = true;
        totalClaimedAmount += amountPerClaim;

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
        if (amountPerClaim == 0) return 0;
        return totalClaimedAmount / amountPerClaim;
    }
}
