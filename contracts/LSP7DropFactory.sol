// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {LSP7ClaimableToken} from "./LSP7ClaimableToken.sol";

/// @title LSP7DropFactory
/// @author Token Claimer
/// @notice Factory for deploying LSP7 fungible token drop campaigns using EIP-1167
///         minimal proxies. Each call to `createTokenDrop` clones the implementation
///         and calls `initialize(...)` on the fresh proxy, with `msg.sender` as owner.
/// @dev Uses OZ `Clones.clone()` for cheap deterministic-free deployments.
///      The implementation contract is set once at factory deployment and is immutable.
///      When `maxSupply_` is 0 (unlimited), the factory passes `type(uint256).max`
///      to the token's `initialize(...)`, making the cap effectively infinite.
contract LSP7DropFactory {

    // ──────────────────── Types ────────────────────

    /// @notice Metadata stored for each deployed LSP7 campaign.
    /// @param contractAddr The deployed LSP7ClaimableToken proxy address.
    /// @param creator      The address (Universal Profile) that created the campaign.
    /// @param name         Human-readable token name.
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

    /// @notice The LSP7ClaimableToken implementation contract that all proxies delegate to.
    address public immutable implementation;

    /// @notice All LSP7 token drop campaigns, in deployment order.
    Campaign[] public tokenCampaigns;

    /// @notice Maps a creator address to the campaign indices they own.
    mapping(address => uint256[]) public tokenCampaignsByCreator;

    // ──────────────────── Events ────────────────────

    /// @notice Emitted when a new LSP7 token drop campaign is created.
    /// @param campaignId   Index in the `tokenCampaigns` array.
    /// @param creator      The address that deployed it.
    /// @param contractAddr The deployed LSP7ClaimableToken proxy address.
    /// @param name         Token name.
    /// @param symbol       Token symbol.
    event TokenCampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        address contractAddr,
        string name,
        string symbol
    );

    // ──────────────────── Constructor ────────────────────

    /// @notice Deploys the factory and creates the implementation contract.
    constructor() {
        implementation = address(new LSP7ClaimableToken());
    }

    // ──────────────────── Create ────────────────────

    /// @notice Deploys a new LSP7 claimable token drop as an EIP-1167 minimal proxy.
    /// @param name_           Token name.
    /// @param symbol_         Token symbol.
    /// @param amountPerClaim_ Tokens minted per claim.
    /// @param maxSupply_      Hard cap on total tokens (0 = unlimited).
    /// @param isNonDivisible_ True for 0 decimals (whole units), false for 18 decimals.
    /// @return The address of the deployed LSP7ClaimableToken proxy.
    function createTokenDrop(
        string memory name_,
        string memory symbol_,
        uint256 amountPerClaim_,
        uint256 maxSupply_,
        bool isNonDivisible_
    ) external returns (address) {
        // Clone the implementation
        address proxy = Clones.clone(implementation);

        // Normalize unlimited supply: 0 → type(uint256).max (CappedSupply requires cap > 0)
        uint256 cap = maxSupply_ == 0 ? type(uint256).max : maxSupply_;

        // Initialize the proxy
        LSP7ClaimableToken(payable(proxy)).initialize(
            name_, symbol_, msg.sender, amountPerClaim_, cap, isNonDivisible_
        );

        uint256 id = tokenCampaigns.length;
        tokenCampaigns.push(Campaign({
            contractAddr: proxy,
            creator:      msg.sender,
            name:         name_,
            symbol:       symbol_,
            createdAt:    block.timestamp
        }));
        tokenCampaignsByCreator[msg.sender].push(id);

        emit TokenCampaignCreated(id, msg.sender, proxy, name_, symbol_);
        return proxy;
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
}
