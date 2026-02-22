// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @dev Mock LSP26 Follower System registry for testing.
///      The real registry is deployed at a hardcoded address in the claimable
///      contracts (0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA).
///      In tests, its deployed bytecode is injected at that address via
///      `hardhat_setCode`, so the claimable contracts call this mock.
///
///      Storage layout (slot 0): mapping(address => uint256) followerCount
///      The test helper `setFollowerCountAt()` in the test file uses
///      `hardhat_setStorageAt` to write to the correct slot after code injection.
contract MockLSP26 {
    /// @notice Follower counts per address.
    /// @dev Slot 0 — storage layout must match what the test helper computes.
    mapping(address => uint256) public followerCount;

    /// @notice Write a follower count (callable by anyone — test-only).
    function setFollowerCount(address account, uint256 count) external {
        followerCount[account] = count;
    }
}
