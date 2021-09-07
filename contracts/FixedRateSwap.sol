// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


contract FixedRateSwap is ERC20, Ownable {
    using SafeERC20 for IERC20;

    event Swap(
        address indexed trader,
        int256 token0Amount,
        int256 token1Amount
    );

    event Deposit(
        address indexed user,
        uint256 token0Amount,
        uint256 token1Amount,
        uint256 share
    );

    event Withdrawal(
        address indexed user,
        uint256 token0Amount,
        uint256 token1Amount,
        uint256 share
    );

    IERC20 immutable public token0;
    IERC20 immutable public token1;

    uint8 immutable private _decimals;

    uint256 constant private _ONE = 1e18;
    uint256 constant private _C1 = 0.9999e18;
    uint256 constant private _C2 = 3.382712334998325432e18;
    uint256 constant private _C3 = 0.456807350974663119e18;

    constructor(
        IERC20 _token0,
        IERC20 _token1,
        string memory name,
        string memory symbol,
        uint8 decimals_
    )
        ERC20(name, symbol)
    {
        token0 = _token0;
        token1 = _token1;
        _decimals = decimals_;
        require(IERC20Metadata(address(_token0)).decimals() == decimals_, "FRS: token0 decimals mismatch");
        require(IERC20Metadata(address(_token1)).decimals() == decimals_, "FRS: token1 decimals mismatch");
    }

    function decimals() public view virtual override returns(uint8) {
        return _decimals;
    }

    /*
     * `getReturn` at point `x = inputBalance / (inputBalance + outputBalance)`:
     * `getReturn(x) = 0.9999 + (0.5817091329374359 - x * 1.2734233188154198)^17`
     * When balance is changed from `inputBalance` to `inputBalance + amount` we should take
     * integral of getReturn to calculate proper amount:
     * `getReturn(x0, x1) = (integral (0.9999 + (0.5817091329374359 - x * 1.2734233188154198)^17) dx from x=x0 to x=x1) / (x1 - x0)`
     * `getReturn(x0, x1) = (0.9999 * x - 3.3827123349983306 * (x - 0.4568073509746632) ** 18 from x=x0 to x=x1) / (x1 - x0)`
     * `getReturn(x0, x1) = (0.9999 * (x1 - x0) + 3.3827123349983306 * ((x0 - 0.4568073509746632) ** 18 - (x1 - 0.4568073509746632) ** 18)) / (x1 - x0)`
     */
    function getReturn(IERC20 tokenFrom, IERC20 tokenTo, uint256 inputAmount) public view returns(uint256 outputAmount) {
        unchecked {
            uint256 fromBalance = tokenFrom.balanceOf(address(this));
            uint256 toBalance = tokenTo.balanceOf(address(this));
            require(inputAmount <= toBalance, "input amount is too big");
            uint256 totalBalance = fromBalance + toBalance;
            uint256 x0 = _ONE * fromBalance / totalBalance;
            uint256 x1 = _ONE * (fromBalance + inputAmount) / totalBalance;
            uint256 x1subx0 = _ONE * inputAmount / totalBalance;
            uint256 amountMultiplier = (
                _C1 * x1subx0 +
                _C2 * _powerHelper(x0) -
                _C2 * _powerHelper(x1)
            ) / x1subx0;
            outputAmount = inputAmount * Math.min(amountMultiplier, _ONE) / _ONE;
        }
    }

    function deposit(uint256 token0Amount, uint256 token1Amount) external returns(uint256 share) {
        share = depositFor(token0Amount, token1Amount, msg.sender);
    }

    function depositFor(uint256 token0Amount, uint256 token1Amount, address to) public onlyOwner returns(uint256 share) {
        uint256 inputAmount = token0Amount + token1Amount;
        require(inputAmount > 0, "Empty deposit is not allowed");
        require(to != address(this), "Deposit to this is forbidden");
        require(to != address(0), "Deposit to zero is forbidden");

        uint256 _totalSupply = totalSupply();
        share = inputAmount;
        if (_totalSupply > 0) {
            uint256 totalBalance = token0.balanceOf(address(this)) + token1.balanceOf(address(this));
            share = inputAmount * _totalSupply / totalBalance;
        }

        if (token0Amount > 0) {
            token0.safeTransferFrom(msg.sender, address(this), token0Amount);
        }
        if (token1Amount > 0) {
            token1.safeTransferFrom(msg.sender, address(this), token1Amount);
        }
        _mint(to, share);
        emit Deposit(to, token0Amount, token1Amount, share);
    }

    function withdraw(uint256 amount) external returns(uint256 token0Share, uint256 token1Share) {
        (token0Share, token1Share) = withdrawFor(amount, msg.sender);
    }

    function withdrawFor(uint256 amount, address to) public returns(uint256 token0Share, uint256 token1Share) {
        require(amount > 0, "Empty withdrawal is not allowed");
        require(to != address(this), "Withdrawal to this is forbidden");
        require(to != address(0), "Withdrawal to zero is forbidden");

        uint256 _totalSupply = totalSupply();
        token0Share = token0.balanceOf(address(this)) * amount / _totalSupply;
        token1Share = token1.balanceOf(address(this)) * amount / _totalSupply;

        _burn(msg.sender, amount);
        emit Withdrawal(msg.sender, token0Share, token1Share, amount);
        if (token0Share > 0) {
            token0.safeTransfer(to, token0Share);
        }
        if (token1Share > 0) {
            token1.safeTransfer(to, token1Share);
        }
    }

    function swap0To1(uint256 inputAmount) external returns(uint256 outputAmount) {
        outputAmount = _swap(token0, token1, inputAmount, msg.sender);
        emit Swap(msg.sender, int256(inputAmount), -int256(outputAmount));
    }

    function swap1To0(uint256 inputAmount) external returns(uint256 outputAmount) {
        outputAmount = _swap(token1, token0, inputAmount, msg.sender);
        emit Swap(msg.sender, -int256(outputAmount), int256(inputAmount));
    }

    function swap0To1For(uint256 inputAmount, address to) external returns(uint256 outputAmount) {
        require(to != address(this), "Swap to this is forbidden");
        require(to != address(0), "Swap to zero is forbidden");

        outputAmount = _swap(token0, token1, inputAmount, to);
        emit Swap(msg.sender, int256(inputAmount), -int256(outputAmount));
    }

    function swap1To0For(uint256 inputAmount, address to) external returns(uint256 outputAmount) {
        require(to != address(this), "Swap to this is forbidden");
        require(to != address(0), "Swap to zero is forbidden");

        outputAmount = _swap(token1, token0, inputAmount, to);
        emit Swap(msg.sender, -int256(outputAmount), int256(inputAmount));
    }

    function _swap(IERC20 tokenFrom, IERC20 tokenTo, uint256 inputAmount, address to) private returns(uint256 outputAmount) {
        require(inputAmount > 0, "Input amount should be > 0");
        outputAmount = getReturn(tokenFrom, tokenTo, inputAmount);
        require(outputAmount > 0, "Empty swap is not allowed");
        tokenFrom.safeTransferFrom(msg.sender, address(this), inputAmount);
        tokenTo.safeTransfer(to, outputAmount);
    }

    function _powerHelper(uint256 x) private pure returns(uint256 p) {
        unchecked {
            if (x > _C3) {
                p = x - _C3;
            } else {
                p = _C3 - x;
            }
            p = p * p / _ONE;  // p ^ 2
            uint256 pp = p * p / _ONE;  // p ^ 4
            pp = pp * pp / _ONE;  // p ^ 8
            pp = pp * pp / _ONE;  // p ^ 16
            p = p * pp / _ONE;  // p ^ 18
        }
    }
}
