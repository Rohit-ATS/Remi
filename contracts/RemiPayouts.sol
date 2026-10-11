// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @title RemiPayouts
/// @notice A privacy-preserving payout rail and an attested income registry.
///
/// The receipt event deliberately contains only settlement facts: addresses,
/// amount and time. Names, countries, categories, memos and payer-local labels
/// belong in the client's encrypted book; event data and transaction calldata
/// are public forever and must never carry that metadata.
///
/// Any account can settle a payout. Only an administrator-attested payer can
/// add to Passport earnings, so a set of self-controlled wallets cannot forge
/// a credit-facing income record by cycling funds between themselves.
contract RemiPayouts {
    IERC20 public immutable token;
    address public immutable admin;

    /// @notice Monotonic receipt number, shared across all payers.
    uint256 public receiptCount;

    /// @notice Payers whose settlements are eligible for Passport earnings.
    mapping(address => bool) public trustedPayers;

    /// @notice Accumulated, administrator-attested income for one payee.
    struct Earnings {
        uint256 totalReceived;
        uint64 payoutCount;
        uint64 clientCount;
        uint64 firstPaidAt;
        uint64 lastPaidAt;
    }

    mapping(address => Earnings) public earnings;
    mapping(address => mapping(address => bool)) public paidBy;

    event TrustedPayerSet(address indexed payer, bool trusted);
    event PaymentSent(
        uint256 indexed receiptNo,
        address indexed payer,
        address indexed payee,
        uint256 amount,
        bool passportEligible,
        uint64 timestamp
    );

    error ZeroAddress();
    error ZeroAmount();
    error TransferFailed();
    error SelfPayment();
    error Unauthorized();

    constructor(address token_, address admin_) {
        if (token_ == address(0) || admin_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
        admin = admin_;
        trustedPayers[admin_] = true;
        emit TrustedPayerSet(admin_, true);
    }

    /// @notice Attests or revokes a payer after the operator's off-chain review.
    /// @dev The admin should be a dedicated multisig in production.
    function setTrustedPayer(address payer, bool trusted) external {
        if (msg.sender != admin) revert Unauthorized();
        if (payer == address(0)) revert ZeroAddress();
        trustedPayers[payer] = trusted;
        emit TrustedPayerSet(payer, trusted);
    }

    /// @notice Settles a direct payout. Metadata is intentionally client-only.
    function payTo(address payee, uint256 amount) external returns (uint256 receiptNo) {
        if (payee == address(0)) revert ZeroAddress();
        if (payee == msg.sender) revert SelfPayment();
        if (amount == 0) revert ZeroAmount();

        if (!token.transferFrom(msg.sender, payee, amount)) revert TransferFailed();

        unchecked {
            receiptNo = ++receiptCount;
        }

        bool passportEligible = trustedPayers[msg.sender];
        if (passportEligible) {
            Earnings storage e = earnings[payee];
            if (!paidBy[payee][msg.sender]) {
                paidBy[payee][msg.sender] = true;
                e.clientCount += 1;
            }
            if (e.payoutCount == 0) e.firstPaidAt = uint64(block.timestamp);
            e.totalReceived += amount;
            e.payoutCount += 1;
            e.lastPaidAt = uint64(block.timestamp);
        }

        emit PaymentSent(
            receiptNo, msg.sender, payee, amount, passportEligible, uint64(block.timestamp)
        );
    }

    /// @notice Returns a payee's attested income record in one call.
    function passportOf(address payee)
        external
        view
        returns (uint256 totalReceived, uint64 payoutCount, uint64 clientCount, uint64 firstPaidAt, uint64 lastPaidAt)
    {
        Earnings storage e = earnings[payee];
        return (e.totalReceived, e.payoutCount, e.clientCount, e.firstPaidAt, e.lastPaidAt);
    }
}
