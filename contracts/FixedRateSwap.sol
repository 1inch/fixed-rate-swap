// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


contract FixedRateSwap is ERC20, Ownable {
    using SafeERC20 for IERC20;

    IERC20 immutable public token0;
    IERC20 immutable public token1;

    uint8 immutable private _decimals;

    uint256 constant private _ONE = 1e18;
    uint256 constant private _C1 = 0.9999e18;
    uint256 constant private _C2 = 3.382712334998325432e18;
    uint256 constant private _C3 = 0.456807350974663119e18;
    uint256 constant private _VIRTUAL_AMOUNT_PRECISION = 10**6;

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
        uint256 fromBalance = tokenFrom.balanceOf(address(this));
        uint256 toBalance = tokenTo.balanceOf(address(this));
        outputAmount = _getReturn(fromBalance, toBalance, inputAmount);
    }

    function _getReturn(uint256 fromBalance, uint256 toBalance, uint256 inputAmount) internal pure returns(uint256 outputAmount) {
        unchecked {
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

    function _checkVirtualAmountsFormula(uint256 token0Amount, uint256 token1Amount, uint256 token0Balance, uint256 token1Balance, uint256 x1, uint256 y1) internal pure returns(bool) {
        unchecked {
            return (token0Amount + x1) * (token1Balance + y1) - (token1Amount - y1) * (token0Balance - x1) <= _VIRTUAL_AMOUNT_PRECISION;
        }
    }

    function _getVirtualAmounts(uint256 token0Amount, uint256 token1Amount, uint256 token0Balance, uint256 token1Balance) internal pure returns(uint256 token0VirtualAmount, uint256 token1VirtualAmount) {
        uint256 y1 = token1Amount / 2;
        uint256 x1 = _getReturn(token1Balance, token0Balance, y1);
        bool balanced = _checkVirtualAmountsFormula(token0Amount, token1Amount, token0Balance, token1Balance, x1, y1);
        while (!balanced) {
            y1 = y1 / 2;
            x1 = _getReturn(token1Balance, token0Balance, y1);
            balanced = _checkVirtualAmountsFormula(token0Amount, token1Amount, token0Balance, token1Balance, x1, y1);
        }

        token0VirtualAmount = token0Amount + x1;
        token1VirtualAmount = token1Amount - y1;
    }

    /*
     *  token0Amount + x1     token0Balance - x1
     * ------------------- = -------------------- , where x1 = f(y1) = getReturn(..., y1)
     *  token1Amount - y1     token1Balance + y1
     */
    function getVirtualAmounts(uint256 token0Amount, uint256 token1Amount) public view returns(uint256 token0VirtualAmount, uint256 token1VirtualAmount) {
        uint256 token0Balance = token0.balanceOf(address(this));
        uint256 token1Balance = token1.balanceOf(address(this));

        uint256 mul0a1b = token0Amount * token1Balance;
        uint256 mul1a0b = token1Amount * token0Balance;
        if (mul0a1b > mul1a0b && mul0a1b - mul1a0b > _VIRTUAL_AMOUNT_PRECISION) {
            (token1VirtualAmount, token0VirtualAmount) = _getVirtualAmounts(token1Amount, token0Amount, token1Balance, token0Balance);
        } else if (mul0a1b < mul1a0b && mul1a0b - mul0a1b > _VIRTUAL_AMOUNT_PRECISION) {
            (token0VirtualAmount, token1VirtualAmount) = _getVirtualAmounts(token0Amount, token1Amount, token0Balance, token1Balance);
        } else {
            (token0VirtualAmount, token1VirtualAmount) = (token0Amount, token1Amount);
        }
    }

    function deposit(uint256 token0Amount, uint256 token1Amount) external returns(uint256 share) {
        share = depositFor(token0Amount, token1Amount, msg.sender);
    }

    function depositFor(uint256 token0Amount, uint256 token1Amount, address to) public onlyOwner returns(uint256 share) {
        (uint256 token0VirtualAmount, uint256 token1VirtualAmount) = getVirtualAmounts(token0Amount, token1Amount);

        uint256 inputAmount = token0VirtualAmount + token1VirtualAmount;
        require(inputAmount > 0, "Empty deposit is not allowed");
        require(to != address(this), "Deposit to this is forbidden");

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
        if (token0Share > 0) {
            token0.safeTransfer(to, token0Share);
        }
        if (token1Share > 0) {
            token1.safeTransfer(to, token1Share);
        }
    }

    function swap0To1(uint256 inputAmount) external returns(uint256 outputAmount) {
        outputAmount = _swap(token0, token1, inputAmount, msg.sender);
    }

    function swap1To0(uint256 inputAmount) external returns(uint256 outputAmount) {
        outputAmount = _swap(token1, token0, inputAmount, msg.sender);
    }

    function swap0To1For(uint256 inputAmount, address to) external returns(uint256 outputAmount) {
        require(to != address(this), "Swap to this is forbidden");
        require(to != address(0), "Swap to zero is forbidden");

        outputAmount = _swap(token0, token1, inputAmount, to);
    }

    function swap1To0For(uint256 inputAmount, address to) external returns(uint256 outputAmount) {
        require(to != address(this), "Swap to this is forbidden");
        require(to != address(0), "Swap to zero is forbidden");

        outputAmount = _swap(token1, token0, inputAmount, to);
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
