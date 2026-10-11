// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4 magicValue);
}

/// @title RemiPayouts
/// @notice A privacy-preserving payout rail and an attested income registry.
///
/// The receipt event deliberately contains only settlement facts: addresses,
/// amount and time. Names, countries, categories, memos and payer-local labels
/// belong in the client's encrypted book; event data and transaction calldata
/// are public forever and must never carry that metadata.
///
/// Any account can settle a payout. Passport earnings require a separate,
/// one-time administrator attestation bound to the exact payer, payee and
/// amount. A blanket "trusted payer" flag is deliberately insufficient: it
/// would let that payer credit an arbitrary wallet it controls.
contract RemiPayouts {
    IERC20 public immutable token;
    address public immutable admin;

    /// @notice Monotonic receipt number, shared across all payers.
    uint256 public receiptCount;

    /// @notice Legacy business-review registry. This is useful operator data,
    /// but is not enough by itself to make a payment Passport-eligible.
    mapping(address => bool) public trustedPayers;

    /// @notice Nonces already consumed by a payer's Passport attestations.
    mapping(address => mapping(uint256 => bool)) public usedPassportNonces;

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
    error AttestationExpired();
    error AttestationUsed();
    error InvalidAttestation();

    bytes32 private constant PASSPORT_ATTESTATION_TYPEHASH = keccak256(
        "PassportAttestation(address payer,address payee,uint256 amount,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant NAME_HASH = keccak256("RemiPayouts");
    bytes32 private constant VERSION_HASH = keccak256("1");
    // secp256k1n / 2. Rejecting high-s signatures prevents signature malleability.
    uint256 private constant SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

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
    /// @dev Settlement remains open to every payer, but never credits Passport.
    function payTo(address payee, uint256 amount) external returns (uint256 receiptNo) {
        return _payTo(payee, amount, false);
    }

    /// @notice Settles a payout and credits Passport when the admin has signed
    /// a still-valid, one-time attestation for this exact payment.
    /// @dev `admin` is the attesting signer. It may be an EOA or an EIP-1271
    /// smart-account/multisig that validates its own signatures.
    function payToWithPassportAttestation(
        address payee,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external returns (uint256 receiptNo) {
        if (block.timestamp > deadline) revert AttestationExpired();
        if (usedPassportNonces[msg.sender][nonce]) revert AttestationUsed();

        bytes32 structHash = keccak256(
            abi.encode(PASSPORT_ATTESTATION_TYPEHASH, msg.sender, payee, amount, nonce, deadline)
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", _domainSeparator(), structHash)
        );
        if (!_isValidAttestation(digest, signature)) revert InvalidAttestation();

        usedPassportNonces[msg.sender][nonce] = true;
        return _payTo(payee, amount, true);
    }

    function _payTo(address payee, uint256 amount, bool passportEligible)
        private
        returns (uint256 receiptNo)
    {
        if (payee == address(0)) revert ZeroAddress();
        if (payee == msg.sender) revert SelfPayment();
        if (amount == 0) revert ZeroAmount();

        if (!token.transferFrom(msg.sender, payee, amount)) revert TransferFailed();

        unchecked {
            receiptNo = ++receiptCount;
        }

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

    /// @notice EIP-712 digest that the administrator signs off chain.
    function passportAttestationDigest(
        address payer,
        address payee,
        uint256 amount,
        uint256 nonce,
        uint256 deadline
    ) external view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(PASSPORT_ATTESTATION_TYPEHASH, payer, payee, amount, nonce, deadline)
        );
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _domainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this))
        );
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > SECP256K1N_HALF || v < 27 || v > 28) return address(0);
        signer = ecrecover(digest, v, r, s);
    }

    function _isValidAttestation(bytes32 digest, bytes calldata signature) private view returns (bool) {
        if (admin.code.length == 0) return _recover(digest, signature) == admin;
        (bool ok, bytes memory result) = admin.staticcall(
            abi.encodeWithSelector(IERC1271.isValidSignature.selector, digest, signature)
        );
        return ok && result.length >= 32 && abi.decode(result, (bytes4)) == 0x1626ba7e;
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
