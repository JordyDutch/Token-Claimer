// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {LSP8IdentifiableDigitalAsset} from "@lukso/lsp8-contracts/contracts/LSP8IdentifiableDigitalAsset.sol";
import {_LSP8_TOKENID_FORMAT_NUMBER} from "@lukso/lsp8-contracts/contracts/LSP8Constants.sol";
import {_LSP4_TOKEN_TYPE_NFT} from "@lukso/lsp4-contracts/contracts/LSP4Constants.sol";
import {ILSP7Balance, ILSP26Followers} from "./ITokenClaimer.sol";

/// @title LSP8ClaimableNFT
/// @author Token Claimer
/// @notice A claimable NFT drop for LUKSO. Creators deploy this via the
///         LSP8DropFactory. Each wallet can claim once, receiving `amountPerClaim`
///         NFTs with auto-incrementing numeric token IDs.
/// @dev Inherits LSP8IdentifiableDigitalAsset (includes LSP14Ownable2Step).
///      Uses a uint256 reentrancy guard (1/2 pattern) for cheaper warm SSTOREs.
///      Partial claims are supported: if fewer NFTs remain than `amountPerClaim`,
///      the claimer receives whatever is left.
contract LSP8ClaimableNFT is LSP8IdentifiableDigitalAsset {

    // ──────────────────── Storage ────────────────────

    /// @notice Whether claiming is currently enabled by the owner.
    bool public claimEnabled;

    /// @notice Unix timestamp after which claims are accepted (0 = no lower bound).
    uint256 public startTime;

    /// @notice Unix timestamp after which claims are rejected (0 = no upper bound).
    uint256 public endTime;

    /// @dev Auto-incrementing token ID counter. Starts at 1 so token ID 0 is never used.
    uint256 private _nextTokenId;

    /// @notice Hard cap on total NFTs that can ever be minted (0 = unlimited).
    uint256 public maxSupply;

    /// @notice Number of NFTs minted per successful claim.
    uint256 public amountPerClaim;

    /// @notice Number of unique addresses that have claimed.
    uint256 public claimerCount;

    /// @dev List of token contract addresses required for claiming.
    address[] private _reqTokens;

    /// @dev Corresponding minimum balances for each required token.
    uint256[] private _reqMinBalances;

    /// @notice Minimum LSP26 follower count a claimer must have (0 = no requirement).
    uint256 public requiredFollowers;

    /// @dev LSP26 Follower System registry on LUKSO mainnet.
    address public constant LSP26_REGISTRY = 0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA;

    /// @notice Tracks whether an address has already claimed.
    mapping(address => bool) public hasClaimed;

    /// @notice keccak256 hash of the codeword (0x0 = no codeword required).
    bytes32 private _codewordHash;

    /// @dev Reentrancy guard using the 1/2 pattern. Warm SSTOREs only (~100 gas each).
    uint256 private _guardStatus = 1;

    // ──────────────────── Events ────────────────────

    event ClaimToggled(bool enabled);
    event ClaimWindowSet(uint256 startTime, uint256 endTime);

    /// @notice Emitted when a user successfully claims NFTs.
    event NFTsClaimed(address indexed claimer, uint256 firstTokenId, uint256 amount);

    /// @notice Emitted when the owner updates the claim requirements.
    /// @param tokenCount Number of token requirements set.
    /// @param followers  Minimum follower count.
    event RequirementsUpdated(uint256 tokenCount, uint256 followers);

    event AmountPerClaimUpdated(uint256 newAmount);
    event LYXRescued(address indexed to, uint256 amount);
    event CodewordUpdated(bool hasCodeword);

    // ──────────────────── Errors ────────────────────

    error ClaimNotActive();
    error AlreadyClaimed();
    error OutsideClaimWindow();
    error MaxSupplyReached();
    error InsufficientTokenBalance();
    error InsufficientFollowers();
    error ReentrancyGuard();
    error RescueFailed();
    error WrongCodeword();
    error InvalidTokenRequirement();

    // ──────────────────── Constructor ────────────────────

    constructor(
        string memory name_,
        string memory symbol_,
        address owner_,
        uint256 maxSupply_,
        uint256 amountPerClaim_
    )
        LSP8IdentifiableDigitalAsset(
            name_,
            symbol_,
            owner_,
            _LSP4_TOKEN_TYPE_NFT,
            _LSP8_TOKENID_FORMAT_NUMBER
        )
    {
        require(amountPerClaim_ <= 50, "Max 50 per claim");
        uint256 apc = amountPerClaim_ == 0 ? 1 : amountPerClaim_;
        require(maxSupply_ == 0 || maxSupply_ >= apc, "maxSupply < amountPerClaim");
        maxSupply = maxSupply_;
        amountPerClaim = apc;
        _nextTokenId = 1;
    }

    // ──────────────────── Receive ────────────────────

    receive() external payable override {}

    // ──────────────────── Owner Controls ────────────────────

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
        require(amount_ > 0 && amount_ <= 50, "Must be 1-50");
        if (maxSupply > 0) {
            uint256 remaining = maxSupply >= _nextTokenId ? maxSupply - _nextTokenId + 1 : 0;
            require(remaining >= amount_, "Would exceed maxSupply");
        }
        amountPerClaim = amount_;
        emit AmountPerClaimUpdated(amount_);
    }

    /// @notice Configures the optional token-holding and follower requirements.
    /// @param tokens_      Array of LSP7/LSP8 contract addresses claimers must hold.
    /// @param minBalances_ Corresponding minimum balances (must equal tokens_.length).
    /// @param followers_   Minimum LSP26 follower count (0 = none).
    function setRequirements(
        address[] calldata tokens_,
        uint256[] calldata minBalances_,
        uint256 followers_
    ) external onlyOwner {
        require(tokens_.length == minBalances_.length, "Length mismatch");
        require(tokens_.length <= 10, "Max 10 token requirements");
        delete _reqTokens;
        delete _reqMinBalances;
        for (uint256 i = 0; i < tokens_.length;) {
            address token = tokens_[i];
            uint256 codeSize;
            assembly { codeSize := extcodesize(token) }
            if (codeSize == 0) revert InvalidTokenRequirement();
            _reqTokens.push(token);
            _reqMinBalances.push(minBalances_[i]);
            unchecked { ++i; }
        }
        requiredFollowers = followers_;
        emit RequirementsUpdated(tokens_.length, followers_);
    }

    /// @notice Returns all token requirements.
    /// @return tokens      Array of required token addresses.
    /// @return minBalances Corresponding minimum balances.
    function getTokenRequirements()
        external
        view
        returns (address[] memory tokens, uint256[] memory minBalances)
    {
        return (_reqTokens, _reqMinBalances);
    }

    /// @notice Sets a codeword required to claim. Stored as a keccak256 hash — the
    ///         plaintext is never stored on-chain. Pass an empty string to clear.
    function setCodeword(string calldata word) external onlyOwner {
        if (bytes(word).length == 0) {
            _codewordHash = bytes32(0);
        } else {
            _codewordHash = keccak256(abi.encodePacked(word));
        }
        emit CodewordUpdated(_codewordHash != bytes32(0));
    }

    /// @notice Whether a codeword is currently required to claim.
    function codewordEnabled() external view returns (bool) {
        return _codewordHash != bytes32(0);
    }

    function rescueLYX(address payable to_, uint256 amount_) external onlyOwner {
        (bool ok, ) = to_.call{value: amount_}("");
        if (!ok) revert RescueFailed();
        emit LYXRescued(to_, amount_);
    }

    function renounceOwnership() public pure override {
        revert("Renounce disabled");
    }

    // ──────────────────── Claim ────────────────────

    /// @notice Claim without a codeword. Reverts if a codeword is currently set.
    function claim() external {
        _doClaim("");
    }

    /// @notice Claim with a codeword. Works whether or not a codeword is set.
    function claimWithCode(string calldata codeword) external {
        _doClaim(codeword);
    }

    function _doClaim(string memory codeword) internal {
        if (_guardStatus != 1) revert ReentrancyGuard();
        _guardStatus = 2;

        if (!claimEnabled) revert ClaimNotActive();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        if (startTime > 0 && block.timestamp < startTime) revert OutsideClaimWindow();
        if (endTime > 0 && block.timestamp > endTime) revert OutsideClaimWindow();

        // Codeword check — only if a codeword is set
        if (_codewordHash != bytes32(0)) {
            if (keccak256(abi.encodePacked(codeword)) != _codewordHash) revert WrongCodeword();
        }

        uint256 toMint = amountPerClaim;
        if (maxSupply > 0) {
            uint256 remaining = maxSupply >= _nextTokenId ? maxSupply - _nextTokenId + 1 : 0;
            if (remaining == 0) revert MaxSupplyReached();
            if (remaining < toMint) toMint = remaining;
        }

        (bool tokenOk, bool followersOk) = _checkRequirements(msg.sender);
        if (!tokenOk) revert InsufficientTokenBalance();
        if (!followersOk) revert InsufficientFollowers();

        hasClaimed[msg.sender] = true;
        claimerCount++;
        uint256 firstId = _nextTokenId;
        _nextTokenId += toMint;

        for (uint256 i = 0; i < toMint;) {
            _mint(msg.sender, bytes32(firstId + i), false, "");
            unchecked { ++i; }
        }

        emit NFTsClaimed(msg.sender, firstId, toMint);

        _guardStatus = 1;
    }

    // ──────────────────── Views ────────────────────

    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    function isClaimActive() external view returns (bool) {
        if (!claimEnabled) return false;
        if (startTime > 0 && block.timestamp < startTime) return false;
        if (endTime > 0 && block.timestamp > endTime) return false;
        if (maxSupply > 0) {
            uint256 remaining = maxSupply >= _nextTokenId ? maxSupply - _nextTokenId + 1 : 0;
            if (remaining == 0) return false;
        }
        return true;
    }

    function totalClaimed() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function totalClaimers() external view returns (uint256) {
        return claimerCount;
    }

    function meetsRequirements(address addr) external view returns (bool tokenOk, bool followersOk) {
        return _checkRequirements(addr);
    }

    function batchHasClaimed(address[] calldata addrs)
        external
        view
        returns (bool[] memory results)
    {
        results = new bool[](addrs.length);
        for (uint256 i = 0; i < addrs.length;) {
            results[i] = hasClaimed[addrs[i]];
            unchecked { ++i; }
        }
    }

    function batchMeetsRequirements(address[] calldata addrs)
        external
        view
        returns (bool[] memory tokenOk, bool[] memory followersOk)
    {
        uint256 len = addrs.length;
        tokenOk = new bool[](len);
        followersOk = new bool[](len);
        for (uint256 i = 0; i < len;) {
            (tokenOk[i], followersOk[i]) = _checkRequirements(addrs[i]);
            unchecked { ++i; }
        }
    }

    // ──────────────────── Internal ────────────────────

    /// @dev Checks all token requirements (ALL must pass) and follower requirement.
    function _checkRequirements(address addr) internal view returns (bool tokenOk, bool followersOk) {
        tokenOk = true;
        followersOk = true;

        uint256 len = _reqTokens.length;
        for (uint256 i = 0; i < len;) {
            if (_reqMinBalances[i] > 0) {
                if (ILSP7Balance(_reqTokens[i]).balanceOf(addr) < _reqMinBalances[i]) {
                    tokenOk = false;
                    break;
                }
            }
            unchecked { ++i; }
        }

        if (requiredFollowers > 0) {
            followersOk = ILSP26Followers(LSP26_REGISTRY).followerCount(addr) >= requiredFollowers;
        }
    }
}
