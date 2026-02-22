// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @dev Minimal interface for triggering a claim on LSP7ClaimableToken or LSP8ClaimableNFT.
interface IClaimable {
    function claim() external;
}

/// @dev Minimal LSP1-compliant receiver contract for use in tests.
///      LSP7/LSP8 with force=false require the recipient to implement
///      the LSP1 UniversalReceiver interface (0x6bb56a14), otherwise
///      the mint/transfer reverts with LSP7NotifyTokenReceiverIsEOA.
///      This mock satisfies that requirement and exposes a doClaim()
///      helper so a test EOA can trigger a claim as this contract.
contract MockLSP1Account {
    /// @dev LSP1 interface ID (keccak256 of universalReceiver sig, first 4 bytes).
    bytes4 internal constant _INTERFACEID_LSP1 = 0x6bb56a14;
    /// @dev ERC165 interface ID.
    bytes4 internal constant _INTERFACEID_ERC165 = 0x01ffc9a7;

    // ── ERC165 ──

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == _INTERFACEID_LSP1 || interfaceId == _INTERFACEID_ERC165;
    }

    // ── LSP1 ──

    /// @notice No-op universalReceiver — just accepts the notification.
    function universalReceiver(bytes32, bytes calldata) external returns (bytes memory) {
        return "";
    }

    // ── Claim helper ──

    /// @notice Calls claim() on the given token/NFT contract as this mock account.
    function doClaim(address tokenContract) external {
        IClaimable(tokenContract).claim();
    }

    /// @notice Accept LYX (useful for LYX-rescue tests).
    receive() external payable {}
}
