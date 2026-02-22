// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @dev Minimal ERC20/LSP7-like mock that exposes a configurable balanceOf.
///      Used to test the requiredToken gate in LSP7ClaimableToken and
///      LSP8ClaimableNFT without deploying a full token contract.
contract MockToken {
    mapping(address => uint256) public balanceOf;

    /// @notice Set the balance for an address (callable by anyone in tests).
    function setBalance(address account, uint256 amount) external {
        balanceOf[account] = amount;
    }
}
