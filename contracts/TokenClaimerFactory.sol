// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {LSP7ClaimableToken} from "./LSP7ClaimableToken.sol";
import {LSP8ClaimableNFT} from "./LSP8ClaimableNFT.sol";

/// @title TokenClaimerFactory
/// @author Token Claimer
/// @notice Unified factory for deploying both LSP7 token drops and LSP8 NFT drops.
///         Creators call `createTokenDrop` or `createNFTDrop` and the factory deploys
///         the appropriate claimable contract, transferring ownership to the caller.
/// @dev Combines the former LSP7DropFactory and LSP8DropFactory into a single contract.
///      Each drop type has its own Campaign array and pagination so existing front-end
///      logic continues to work unchanged.
contract TokenClaimerFactory {

    // ──────────────────── Types ────────────────────

    /// @notice Metadata stored for each deployed campaign.
    /// @param contractAddr The deployed claimable contract address.
    /// @param creator      The address (Universal Profile) that created the campaign.
    /// @param name         Human-readable token/collection name.
    /// @param symbol       Ticker symbol.
    /// @param createdAt    Block timestamp when the campaign was created.
    struct Campaign {
        address contractAddr;
        address creator;
        string name;
        string symbol;
        uint256 createdAt;
    }

    // ──────────────────── Storage ────────────────────

    /// @notice All LSP7 token drop campaigns, in deployment order.
    Campaign[] public tokenCampaigns;

    /// @notice All LSP8 NFT drop campaigns, in deployment order.
    Campaign[] public nftCampaigns;

    /// @notice Maps a creator address to the indices of their token campaigns.
    mapping(address => uint256[]) public tokenCampaignsByCreator;

    /// @notice Maps a creator address to the indices of their NFT campaigns.
    mapping(address => uint256[]) public nftCampaignsByCreator;

    // ──────────────────── Events ────────────────────

    /// @notice Emitted when a new LSP7 token drop campaign is created.
    /// @param campaignId   Index in the tokenCampaigns array.
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

    /// @notice Emitted when a new LSP8 NFT drop campaign is created.
    /// @param campaignId   Index in the nftCampaigns array.
    /// @param creator      The address that deployed it.
    /// @param contractAddr The deployed LSP8ClaimableNFT address.
    /// @param name         Collection name.
    /// @param symbol       Collection symbol.
    event NFTCampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        address contractAddr,
        string name,
        string symbol
    );

    // ──────────────────── Token Drop (LSP7) ────────────────────

    /// @notice Deploys a new LSP7 claimable token drop.
    /// @param name_           Token name.
    /// @param symbol_         Token symbol.
    /// @param amountPerClaim_ Tokens minted per claim.
    /// @param maxSupply_      Hard cap (0 = unlimited).
    /// @param isNonDivisible_ True for 0 decimals (whole units), false for 18 decimals.
    /// @return The address of the deployed LSP7ClaimableToken.
    function createTokenDrop(
        string memory name_,
        string memory symbol_,
        uint256 amountPerClaim_,
        uint256 maxSupply_,
        bool isNonDivisible_
    ) external returns (address) {
        // Deploy a new LSP7ClaimableToken with msg.sender as owner
        LSP7ClaimableToken token = new LSP7ClaimableToken(
            name_, symbol_, msg.sender, amountPerClaim_, maxSupply_, isNonDivisible_
        );

        // Record the campaign
        uint256 id = tokenCampaigns.length;
        tokenCampaigns.push(Campaign({
            contractAddr: address(token),
            creator: msg.sender,
            name: name_,
            symbol: symbol_,
            createdAt: block.timestamp
        }));
        tokenCampaignsByCreator[msg.sender].push(id);

        emit TokenCampaignCreated(id, msg.sender, address(token), name_, symbol_);
        return address(token);
    }

    /// @notice Returns the total number of LSP7 token campaigns.
    /// @return The count.
    function totalCampaigns() external view returns (uint256) {
        return tokenCampaigns.length;
    }

    /// @notice Returns campaign IDs created by a specific address (token drops).
    /// @param creator_ The creator's address.
    /// @return Array of campaign indices.
    function getCampaignsByCreator(address creator_) external view returns (uint256[] memory) {
        return tokenCampaignsByCreator[creator_];
    }

    /// @notice Paginated retrieval of token campaigns.
    /// @param offset_ Start index.
    /// @param limit_  Max items to return.
    /// @return Array of Campaign structs.
    function getCampaigns(uint256 offset_, uint256 limit_) external view returns (Campaign[] memory) {
        uint256 total = tokenCampaigns.length;
        if (offset_ >= total) return new Campaign[](0);
        uint256 end = offset_ + limit_ > total ? total : offset_ + limit_;
        Campaign[] memory result = new Campaign[](end - offset_);
        for (uint256 i = offset_; i < end; i++) result[i - offset_] = tokenCampaigns[i];
        return result;
    }

    // ──────────────────── NFT Drop (LSP8) ────────────────────

    /// @notice Deploys a new LSP8 claimable NFT drop.
    /// @param name_           Collection name.
    /// @param symbol_         Collection symbol.
    /// @param maxSupply_      Hard cap on total NFTs (0 = unlimited).
    /// @param amountPerClaim_ NFTs minted per claim (max 50).
    /// @return The address of the deployed LSP8ClaimableNFT.
    function createNFTDrop(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        uint256 amountPerClaim_
    ) external returns (address) {
        // Deploy a new LSP8ClaimableNFT with msg.sender as owner
        LSP8ClaimableNFT nft = new LSP8ClaimableNFT(
            name_, symbol_, msg.sender, maxSupply_, amountPerClaim_
        );

        // Record the campaign
        uint256 id = nftCampaigns.length;
        nftCampaigns.push(Campaign({
            contractAddr: address(nft),
            creator: msg.sender,
            name: name_,
            symbol: symbol_,
            createdAt: block.timestamp
        }));
        nftCampaignsByCreator[msg.sender].push(id);

        emit NFTCampaignCreated(id, msg.sender, address(nft), name_, symbol_);
        return address(nft);
    }

    /// @notice Returns the total number of LSP8 NFT campaigns.
    /// @return The count.
    function totalNFTCampaigns() external view returns (uint256) {
        return nftCampaigns.length;
    }

    /// @notice Returns campaign IDs created by a specific address (NFT drops).
    /// @param creator_ The creator's address.
    /// @return Array of campaign indices.
    function getNFTCampaignsByCreator(address creator_) external view returns (uint256[] memory) {
        return nftCampaignsByCreator[creator_];
    }

    /// @notice Paginated retrieval of NFT campaigns.
    /// @param offset_ Start index.
    /// @param limit_  Max items to return.
    /// @return Array of Campaign structs.
    function getNFTCampaigns(uint256 offset_, uint256 limit_) external view returns (Campaign[] memory) {
        uint256 total = nftCampaigns.length;
        if (offset_ >= total) return new Campaign[](0);
        uint256 end = offset_ + limit_ > total ? total : offset_ + limit_;
        Campaign[] memory result = new Campaign[](end - offset_);
        for (uint256 i = offset_; i < end; i++) result[i - offset_] = nftCampaigns[i];
        return result;
    }
}
