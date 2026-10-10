// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title DemoUSD
/// @notice A 6-decimal ERC20 stand-in for AUSD, for testnet development only.
/// Mainnet settles in real AUSD; nothing in the app depends on this contract
/// existing, only on the 6-decimal shape it shares with AUSD.
contract DemoUSD {
    string public constant name = "Demo USD";
    string public constant symbol = "dUSD";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();

    /// @notice Open mint. Acceptable because this token only ever exists on testnet.
    function mint(address to, uint256 value) external {
        balanceOf[to] += value;
        totalSupply += value;
        emit Transfer(address(0), to, value);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        return _move(msg.sender, to, value);
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - value;
        }
        return _move(from, to, value);
    }

    function _move(address from, address to, uint256 value) private returns (bool) {
        uint256 bal = balanceOf[from];
        if (bal < value) revert InsufficientBalance();
        balanceOf[from] = bal - value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }
}
