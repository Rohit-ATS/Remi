// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function decimals() external view returns (uint8);
}

/// @title RemiPayouts
/// @notice Payout rail and income registry for Remi.
///
/// Two sides are written by one call:
///
/// 1. The payer's side — a receipt, so the business has a bookkeeping entry.
/// 2. The payee's side — an `Earnings` row, so the worker accumulates a
///    verifiable income history that no single payer owns.
///
/// The second half is the reason this is a contract rather than a database.
/// A worker paid by three unrelated businesses ends up with one income record
/// that any of them can write to, none of them can edit, and a lender can read
/// without asking Remi for permission.
///
/// Names are deliberately absent. `label` is a payer-local handle and the
/// payee's real identity is encrypted client-side under a second passkey-derived
/// key, so the chain carries amounts and counterparties, never people.
contract RemiPayouts {
    /// @dev Token every payout settles in. Immutable so a payer cannot be
    /// tricked into settling in a token they did not approve.
    IERC20 public immutable token;

    /// @notice Monotonic receipt number, shared across all payers.
    uint256 public receiptCount;

    struct Payee {
        address wallet;
        string country;
        bool exists;
    }

    /// @notice Accumulated income for one payee address. This is the Passport.
    struct Earnings {
        uint256 totalReceived;
        uint64 payoutCount;
        uint64 clientCount;
        uint64 firstPaidAt;
        uint64 lastPaidAt;
    }

    /// @dev payer => label => payee record.
    mapping(address => mapping(string => Payee)) private _payees;
    /// @dev payer => labels saved, so a client can list a directory it owns.
    mapping(address => string[]) private _labels;
    /// @dev payee => accumulated income.
    mapping(address => Earnings) public earnings;
    /// @dev payee => payer => whether this payer has ever paid them, for clientCount.
    mapping(address => mapping(address => bool)) public paidBy;

    event PayeeSaved(address indexed payer, string label, address indexed wallet, string country);

    event PaymentSent(
        uint256 indexed receiptNo,
        address indexed payer,
        address indexed payee,
        uint256 amount,
        string label,
        string memo,
        string category,
        uint64 timestamp
    );

    error ZeroAddress();
    error ZeroAmount();
    error EmptyLabel();
    error UnknownLabel();
    error TransferFailed();
    error SelfPayment();

    constructor(address token_) {
        if (token_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
    }

    /// @notice Saves or updates a payee under a label the caller owns.
    function savePayee(string calldata label, address wallet, string calldata country) external {
        if (bytes(label).length == 0) revert EmptyLabel();
        if (wallet == address(0)) revert ZeroAddress();

        Payee storage p = _payees[msg.sender][label];
        if (!p.exists) {
            p.exists = true;
            _labels[msg.sender].push(label);
        }
        p.wallet = wallet;
        p.country = country;

        emit PayeeSaved(msg.sender, label, wallet, country);
    }

    /// @notice Pays a saved payee by label.
    function pay(string calldata label, uint256 amount, string calldata memo, string calldata category)
        external
        returns (uint256 receiptNo)
    {
        Payee storage p = _payees[msg.sender][label];
        if (!p.exists) revert UnknownLabel();
        return _settle(p.wallet, amount, label, memo, category);
    }

    /// @notice Pays an address directly, without saving it first.
    function payTo(address payee, uint256 amount, string calldata label, string calldata memo, string calldata category)
        external
        returns (uint256 receiptNo)
    {
        return _settle(payee, amount, label, memo, category);
    }

    /// @dev Moves the money, then writes both sides of the record.
    function _settle(
        address payee,
        uint256 amount,
        string calldata label,
        string calldata memo,
        string calldata category
    ) private returns (uint256 receiptNo) {
        if (payee == address(0)) revert ZeroAddress();
        if (payee == msg.sender) revert SelfPayment();
        if (amount == 0) revert ZeroAmount();

        // Pull funds first: no record is written for a payout that did not land.
        // A token returning false rather than reverting is caught here.
        if (!token.transferFrom(msg.sender, payee, amount)) revert TransferFailed();

        unchecked {
            receiptNo = ++receiptCount;
        }

        Earnings storage e = earnings[payee];
        if (!paidBy[payee][msg.sender]) {
            paidBy[payee][msg.sender] = true;
            e.clientCount += 1;
        }
        if (e.payoutCount == 0) {
            e.firstPaidAt = uint64(block.timestamp);
        }
        e.totalReceived += amount;
        e.payoutCount += 1;
        e.lastPaidAt = uint64(block.timestamp);

        emit PaymentSent(
            receiptNo, msg.sender, payee, amount, label, memo, category, uint64(block.timestamp)
        );
    }

    /// @notice Returns the labels a payer has saved.
    function labelsOf(address payer) external view returns (string[] memory) {
        return _labels[payer];
    }

    /// @notice Returns one saved payee by label.
    function payeeOf(address payer, string calldata label)
        external
        view
        returns (address wallet, string memory country, bool exists)
    {
        Payee storage p = _payees[payer][label];
        return (p.wallet, p.country, p.exists);
    }

    /// @notice Returns a payee's income record in one call, for the Passport.
    function passportOf(address payee)
        external
        view
        returns (uint256 totalReceived, uint64 payoutCount, uint64 clientCount, uint64 firstPaidAt, uint64 lastPaidAt)
    {
        Earnings storage e = earnings[payee];
        return (e.totalReceived, e.payoutCount, e.clientCount, e.firstPaidAt, e.lastPaidAt);
    }
}
