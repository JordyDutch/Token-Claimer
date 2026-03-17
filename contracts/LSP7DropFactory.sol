// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {LSP7ClaimableToken} from "./LSP7ClaimableToken.sol";

/// @title LSP7DropFactory
/// @author Token Claimer
/// @notice Factory for deploying LSP7 fungible token drop campaigns.
///         Each call to `createTokenDrop` deploys a fresh LSP7ClaimableToken
///         with `msg.sender` as owner and records the campaign on-chain.
/// @dev Separated from LSP8DropFactory to keep each factory's bytecode under the
///      24 576-byte EIP-170 (Spurious Dragon) contract size limit. The unified
///      TokenClaimerFactory embedded both child contracts' creation bytecode,
///      pushing it to ~36 KB. Each split factory stays at ~16–18 KB.   
contract LSP7DropFactory {

    // ──────────────────── Types ────────────────────

    /// @notice Metadata stored for each deployed LSP7 campaign.
    /// @param contractAddr The deployed LSP7ClaimableToken address.
    /// @param creator      The address (Universal Profile) that created the campaign.
    /// @param name         Human-readable token name.
    /// @param symbol       Ticker symbol.
    /// @param createdAt    Block timestamp when the campaign was created.
    /// @param isNonDivisible Whether the token uses 0 decimals (NFT-style).
    struct Campaign {
        address contractAddr;
        address creator;
        string name;
        string symbol;
        uint256 createdAt;
        bool isNonDivisible;
    }

    // ──────────────────── Storage ────────────────────

    /// @notice All LSP7 token drop campaigns (both divisible and non-divisible), in deployment order.
    Campaign[] public tokenCampaigns;

    /// @notice Maps a creator address to the campaign indices they own.
    mapping(address => uint256[]) public tokenCampaignsByCreator;

    /// @notice Indices of non-divisible (NFT-style) campaigns for easy filtering.
    uint256[] private _nftCampaignIds;

    // ──────────────────── Events ────────────────────

    /// @notice Emitted when a new LSP7 token drop campaign is created.
    /// @param campaignId   Index in the `tokenCampaigns` array.
    /// @param creator      The address that deployed it.
    /// @param contractAddr The deployed LSP7ClaimableToken address.
    /// @param name         Token name.
    /// @param symbol       Token symbol.
    event TokenCampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        address contractAddr,
        string name,
        string symbol
    );

    /// @notice Emitted when a new LSP7 non-divisible NFT drop campaign is created.
    event NFTCampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        address contractAddr,
        string name,
        string symbol
    );

    // ──────────────────── Create ────────────────────

    /// @notice Deploys a new LSP7 claimable token drop.
    /// @param name_           Token name.
    /// @param symbol_         Token symbol.
    /// @param amountPerClaim_ Tokens minted per claim.
    /// @param maxSupply_      Hard cap on total tokens (0 = unlimited).
    /// @param isNonDivisible_ True for 0 decimals (whole units), false for 18 decimals.
    /// @return The address of the deployed LSP7ClaimableToken.
    function createTokenDrop(
        string memory name_,
        string memory symbol_,
        uint256 amountPerClaim_,
        uint256 maxSupply_,
        bool isNonDivisible_
    ) external returns (address) {
        LSP7ClaimableToken token = new LSP7ClaimableToken(
            name_, symbol_, msg.sender, amountPerClaim_, maxSupply_, isNonDivisible_
        );

        uint256 id = tokenCampaigns.length;
        tokenCampaigns.push(Campaign({
            contractAddr: address(token),
            creator:      msg.sender,
            name:         name_,
            symbol:       symbol_,
            createdAt:    block.timestamp,
            isNonDivisible: isNonDivisible_
        }));
        tokenCampaignsByCreator[msg.sender].push(id);
        if (isNonDivisible_) {
            _nftCampaignIds.push(id);
        }

        emit TokenCampaignCreated(id, msg.sender, address(token), name_, symbol_);
        return address(token);
    }

    /// @notice Convenience function to deploy an LSP7 non-divisible (NFT-style) drop.
    ///         Equivalent to createTokenDrop(..., isNonDivisible_=true).
    /// @param name_           Collection name.
    /// @param symbol_         Collection symbol.
    /// @param maxSupply_      Hard cap on total items (0 = unlimited).
    /// @param amountPerClaim_ Items minted per claim.
    /// @return The address of the deployed LSP7ClaimableToken (non-divisible).
    function createNFTDrop(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        uint256 amountPerClaim_
    ) external returns (address) {
        LSP7ClaimableToken token = new LSP7ClaimableToken(
            name_, symbol_, msg.sender, amountPerClaim_, maxSupply_, true
        );

        uint256 id = tokenCampaigns.length;
        tokenCampaigns.push(Campaign({
            contractAddr: address(token),
            creator:      msg.sender,
            name:         name_,
            symbol:       symbol_,
            createdAt:    block.timestamp,
            isNonDivisible: true
        }));
        tokenCampaignsByCreator[msg.sender].push(id);
        _nftCampaignIds.push(id);

        emit NFTCampaignCreated(id, msg.sender, address(token), name_, symbol_);
        return address(token);
    }

    // ──────────────────── Views ────────────────────

    /// @notice Returns the total number of LSP7 token campaigns.
    function totalCampaigns() external view returns (uint256) {
        return tokenCampaigns.length;
    }

    /// @notice Returns all campaign indices created by a specific address.
    /// @param creator_ The creator's address.
    function getCampaignsByCreator(address creator_) external view returns (uint256[] memory) {
        return tokenCampaignsByCreator[creator_];
    }

    /// @notice Paginated retrieval of token campaigns.
    /// @param offset_ Zero-based start index.
    /// @param limit_  Maximum number of items to return.
    /// @return Array of Campaign structs in deployment order.
    function getCampaigns(uint256 offset_, uint256 limit_)
        external
        view
        returns (Campaign[] memory)
    {
        uint256 total = tokenCampaigns.length;
        if (offset_ >= total) return new Campaign[](0);
        uint256 end = offset_ + limit_ > total ? total : offset_ + limit_;
        Campaign[] memory result = new Campaign[](end - offset_);
        for (uint256 i = offset_; i < end;) {
            result[i - offset_] = tokenCampaigns[i];
            unchecked { ++i; }
        }
        return result;
    }

    // ──────────────────── NFT Views ────────────────────

    /// @notice Returns the total number of non-divisible (NFT-style) campaigns.
    function totalNFTCampaigns() external view returns (uint256) {
        return _nftCampaignIds.length;
    }

    /// @notice Paginated retrieval of non-divisible (NFT) campaigns.
    /// @param offset_ Zero-based start index into the NFT campaign list.
    /// @param limit_  Maximum number of items to return.
    /// @return Array of Campaign structs.
    function getNFTCampaigns(uint256 offset_, uint256 limit_)
        external
        view
        returns (Campaign[] memory)
    {
        uint256 total = _nftCampaignIds.length;
        if (offset_ >= total) return new Campaign[](0);
        uint256 end = offset_ + limit_ > total ? total : offset_ + limit_;
        Campaign[] memory result = new Campaign[](end - offset_);
        for (uint256 i = offset_; i < end;) {
            result[i - offset_] = tokenCampaigns[_nftCampaignIds[i]];
            unchecked { ++i; }
        }
        return result;
    }
}
