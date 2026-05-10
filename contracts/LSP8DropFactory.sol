// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {LSP8ClaimableNFT} from "./LSP8ClaimableNFT.sol";

/// @title LSP8DropFactory
/// @author Token Claimer
/// @notice Factory for deploying LSP8 NFT drop campaigns.
///         Each call to `createNFTDrop` deploys a fresh LSP8ClaimableNFT
///         with `msg.sender` as owner and records the campaign on-chain.
/// @dev Separated from LSP7DropFactory to stay under the 24 576-byte EIP-170
///      contract size limit. The previously unified TokenClaimerFactory embedded
///      both child contracts' creation bytecode, reaching ~36 KB. Each split
///      factory stays at ~16–18 KB.
contract LSP8DropFactory {

    // ──────────────────── Errors ────────────────────

    error InvalidLSP26Registry();

    // ──────────────────── Types ────────────────────

    /// @notice Metadata stored for each deployed LSP8 campaign.
    /// @param contractAddr The deployed LSP8ClaimableNFT address.
    /// @param creator      The address (Universal Profile) that created the campaign.
    /// @param name         Human-readable collection name.
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

    /// @notice LSP26 Follower System registry passed into every created drop.
    address public immutable lsp26Registry;

    /// @notice All LSP8 NFT drop campaigns, in deployment order.
    Campaign[] public nftCampaigns;

    /// @notice Maps a creator address to the campaign indices they own.
    mapping(address => uint256[]) public nftCampaignsByCreator;

    // ──────────────────── Events ────────────────────

    /// @notice Emitted when a new LSP8 NFT drop campaign is created.
    /// @param campaignId   Index in the `nftCampaigns` array.
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

    // ──────────────────── Constructor ────────────────────

    /// @param lsp26Registry_ LSP26 Follower System registry for this network.
    constructor(address lsp26Registry_) {
        if (lsp26Registry_ == address(0)) revert InvalidLSP26Registry();
        lsp26Registry = lsp26Registry_;
    }

    // ──────────────────── Create ────────────────────

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
        LSP8ClaimableNFT nft = new LSP8ClaimableNFT(
            name_, symbol_, msg.sender, maxSupply_, amountPerClaim_, lsp26Registry
        );

        uint256 id = nftCampaigns.length;
        nftCampaigns.push(Campaign({
            contractAddr: address(nft),
            creator:      msg.sender,
            name:         name_,
            symbol:       symbol_,
            createdAt:    block.timestamp
        }));
        nftCampaignsByCreator[msg.sender].push(id);

        emit NFTCampaignCreated(id, msg.sender, address(nft), name_, symbol_);
        return address(nft);
    }

    // ──────────────────── Views ────────────────────

    /// @notice Returns the total number of LSP8 NFT campaigns.
    function totalNFTCampaigns() external view returns (uint256) {
        return nftCampaigns.length;
    }

    /// @notice Returns all campaign indices created by a specific address.
    /// @param creator_ The creator's address.
    function getNFTCampaignsByCreator(address creator_) external view returns (uint256[] memory) {
        return nftCampaignsByCreator[creator_];
    }

    /// @notice Paginated retrieval of NFT campaigns.
    /// @param offset_ Zero-based start index.
    /// @param limit_  Maximum number of items to return.
    /// @return Array of Campaign structs in deployment order.
    function getNFTCampaigns(uint256 offset_, uint256 limit_)
        external
        view
        returns (Campaign[] memory)
    {
        uint256 total = nftCampaigns.length;
        if (offset_ >= total) return new Campaign[](0);
        uint256 end = offset_ + limit_ > total ? total : offset_ + limit_;
        Campaign[] memory result = new Campaign[](end - offset_);
        for (uint256 i = offset_; i < end;) {
            result[i - offset_] = nftCampaigns[i];
            unchecked { ++i; }
        }
        return result;
    }
}
