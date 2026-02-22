// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {LSP7ClaimableToken} from "./LSP7ClaimableToken.sol";
import {LSP8ClaimableNFT} from "./LSP8ClaimableNFT.sol";

/**
 * @title LSP7DropFactory
 * @notice Factory for creators to deploy LSP7 fungible token claim campaigns.
 */
contract LSP7DropFactory {
    struct Campaign {
        address contractAddr;
        address creator;
        string name;
        string symbol;
        uint256 createdAt;
    }

    Campaign[] public campaigns;
    mapping(address => uint256[]) public campaignsByCreator;

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        address contractAddr,
        string name,
        string symbol
    );

    function createTokenDrop(
        string memory name_,
        string memory symbol_,
        uint256 amountPerClaim_,
        uint256 maxSupply_,
        uint8 decimals_
    ) external returns (address) {
        LSP7ClaimableToken token = new LSP7ClaimableToken(
            name_, symbol_, msg.sender, amountPerClaim_, maxSupply_, decimals_
        );

        uint256 id = campaigns.length;
        campaigns.push(Campaign({
            contractAddr: address(token),
            creator: msg.sender,
            name: name_,
            symbol: symbol_,
            createdAt: block.timestamp
        }));
        campaignsByCreator[msg.sender].push(id);
        emit CampaignCreated(id, msg.sender, address(token), name_, symbol_);
        return address(token);
    }

    function totalCampaigns() external view returns (uint256) { return campaigns.length; }

    function getCampaignsByCreator(address creator_) external view returns (uint256[] memory) {
        return campaignsByCreator[creator_];
    }

    function getCampaigns(uint256 offset_, uint256 limit_) external view returns (Campaign[] memory) {
        uint256 total = campaigns.length;
        if (offset_ >= total) return new Campaign[](0);
        uint256 end = offset_ + limit_ > total ? total : offset_ + limit_;
        Campaign[] memory result = new Campaign[](end - offset_);
        for (uint256 i = offset_; i < end; i++) result[i - offset_] = campaigns[i];
        return result;
    }
}

/**
 * @title LSP8DropFactory
 * @notice Factory for creators to deploy LSP8 NFT claim campaigns.
 */
contract LSP8DropFactory {
    struct Campaign {
        address contractAddr;
        address creator;
        string name;
        string symbol;
        uint256 createdAt;
    }

    Campaign[] public campaigns;
    mapping(address => uint256[]) public campaignsByCreator;

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        address contractAddr,
        string name,
        string symbol
    );

    function createNFTDrop(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        uint256 amountPerClaim_
    ) external returns (address) {
        LSP8ClaimableNFT nft = new LSP8ClaimableNFT(
            name_, symbol_, msg.sender, maxSupply_, amountPerClaim_
        );

        uint256 id = campaigns.length;
        campaigns.push(Campaign({
            contractAddr: address(nft),
            creator: msg.sender,
            name: name_,
            symbol: symbol_,
            createdAt: block.timestamp
        }));
        campaignsByCreator[msg.sender].push(id);
        emit CampaignCreated(id, msg.sender, address(nft), name_, symbol_);
        return address(nft);
    }

    function totalCampaigns() external view returns (uint256) { return campaigns.length; }

    function getCampaignsByCreator(address creator_) external view returns (uint256[] memory) {
        return campaignsByCreator[creator_];
    }

    function getCampaigns(uint256 offset_, uint256 limit_) external view returns (Campaign[] memory) {
        uint256 total = campaigns.length;
        if (offset_ >= total) return new Campaign[](0);
        uint256 end = offset_ + limit_ > total ? total : offset_ + limit_;
        Campaign[] memory result = new Campaign[](end - offset_);
        for (uint256 i = offset_; i < end; i++) result[i - offset_] = campaigns[i];
        return result;
    }
}
