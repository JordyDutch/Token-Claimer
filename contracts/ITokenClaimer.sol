// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title ILSP7Balance
/// @notice Minimal interface for querying an LSP7 or LSP8 token balance.
/// @dev Extracted into a shared file so both LSP7ClaimableToken and LSP8ClaimableNFT
///      can reference it without duplicating the declaration. Works for any ERC20-like
///      or LSP7/LSP8 contract that exposes `balanceOf(address)`.
interface ILSP7Balance {
    /// @notice Returns the token balance of `account`.
    /// @param account The address whose balance is queried.
    /// @return The number of tokens held by `account`.
    function balanceOf(address account) external view returns (uint256);
}

/// @title ILSP26Followers
/// @notice Minimal interface for querying follower counts from the LSP26 Follower System.
/// @dev The LSP26 registry is deployed at a fixed address on LUKSO mainnet.
///      We only need `followerCount` for gating claims behind a minimum audience size.
interface ILSP26Followers {
    /// @notice Returns how many accounts follow `addr`.
    /// @param addr The address whose follower count is queried.
    /// @return The number of followers.
    function followerCount(address addr) external view returns (uint256);

    /// @notice Returns whether `follower` follows `addr`.
    /// @param follower The account that may be following.
    /// @param addr The account being followed.
    /// @return True if `follower` follows `addr`.
    function isFollowing(address follower, address addr) external view returns (bool);
}
