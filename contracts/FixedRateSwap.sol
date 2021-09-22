// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

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
    uint256 immutable private _threshold;

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
        _threshold = 10 ** (decimals_ / 2);
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
        uint256 fromBalance = tokenFrom.balanceOf(address(this));
        uint256 toBalance = tokenTo.balanceOf(address(this));
        require(inputAmount <= toBalance, "input amount is too big");
        outputAmount = _getReturn(fromBalance, toBalance, inputAmount);
    }

    function _getReturn(uint256 fromBalance, uint256 toBalance, uint256 inputAmount) internal pure returns(uint256 outputAmount) {
        unchecked {
            uint256 totalBalance = fromBalance + toBalance;
            uint256 x0 = _ONE * fromBalance / totalBalance;
            uint256 x1 = _ONE * (fromBalance + inputAmount) / totalBalance;
            uint256 scaledInputAmount = _ONE * inputAmount;
            uint256 amountMultiplier = (
                _C1 * scaledInputAmount / totalBalance +
                _C2 * _powerHelper(x0) -
                _C2 * _powerHelper(x1)
            ) * totalBalance / scaledInputAmount;
            outputAmount = inputAmount * Math.min(amountMultiplier, _ONE) / _ONE;
        }
    }

    /*
     * Equilibrium is when ratio of amounts equals to ratio of balances
     *
     *  x      xBalance
     * --- == ----------
     *  y      yBalance
     *
     */
    function _checkVirtualAmountsFormula(uint256 x, uint256 y, uint256 xBalance, uint256 yBalance) internal pure returns(int256) {
        unchecked {
            return int256(x * yBalance - y * xBalance);
        }
    }

    /*
     * Inital approximation of dx is taken from the same equation by assuming dx ~ dy
     *
     * x - dx     xBalance + dx
     * ------  =  ------------
     * y + dx     yBalance - dx
     *
     * dx = (x * yBalance - xBalance * y) / (xBalance + yBalance + x + y)
     *
     */
    function _getVirtualAmountsForDeposit(uint256 x, uint256 y, uint256 xBalance, uint256 yBalance) internal view returns(uint256, uint256) {
        uint256 dx = (x * yBalance - y * xBalance) / (xBalance + yBalance + x + y);
        if (dx == 0) {
            return (x, y);
        }
        uint256 left = dx * 998 / 1000;
        uint256 right = Math.min(dx * 1002 / 1000, yBalance);
        uint256 dy = _getReturn(xBalance, yBalance, dx);
        int256 shift = _checkVirtualAmountsFormula(x - dx, y + dy, xBalance + dx, yBalance - dy);

        while (left + _threshold < right) {
            if (shift > 0) {
                left = dx;
                dx = (dx + right) / 2;
            } else if (shift < 0) {
                right = dx;
                dx = (left + dx) / 2;
            } else {
                break;
            }
            dy = _getReturn(xBalance, yBalance, dx);
            shift = _checkVirtualAmountsFormula(x - dx, y + dy, xBalance + dx, yBalance - dy);
        }

        return (x - dx, y + dy);
    }

    /*
     * Inital approximation of dx is taken from the same equation by assuming dx ~ dy
     *
     * x - dx        firstTokenShare
     * ------  =  ----------------------
     * y + dx     _ONE - firstTokenShare
     *
     * dx = (x * (_ONE - firstTokenShare) - y * firstTokenShare) / _ONE
     */

    function _getRealAmountsForWithdraw(uint256 virtualX, uint256 virtualY, uint256 balanceX, uint256 balanceY, uint256 firstTokenShare) internal view returns(uint256, uint256) {
        require(balanceX != 0 || balanceY != 0, "Amount exceeds total balance");
        if (firstTokenShare == 0) {
            return (0, virtualY + _getReturn(balanceX, balanceY, virtualX));
        }

        uint256 secondTokenShare = _ONE - firstTokenShare;
        uint256 dx = (virtualX * (_ONE - firstTokenShare) - virtualY * firstTokenShare) / _ONE;
        uint256 left = dx * 998 / 1000;
        uint256 right = Math.min(dx * 1002 / 1000, balanceY);
        uint256 dy = _getReturn(balanceX, balanceY, dx);

        int256 shift = _checkVirtualAmountsFormula(virtualX - dx, virtualY + dy, firstTokenShare, secondTokenShare);

        while (left + _threshold < right) {
            if (shift > 0) {
                left = dx;
                dx = (dx + right) / 2;
            } else if (shift < 0) {
                right = dx;
                dx = (left + dx) / 2;
            } else {
                break;
            }
            dy = _getReturn(balanceX, balanceY, dx);
            shift = _checkVirtualAmountsFormula(virtualX - dx, virtualY + dy, firstTokenShare, secondTokenShare);
        }

        return (virtualX - dx, virtualY + dy);
    }

    function getVirtualAmountsForDeposit(uint256 token0Amount, uint256 token1Amount) public view returns(uint256 token0VirtualAmount, uint256 token1VirtualAmount) {
        uint256 token0Balance = token0.balanceOf(address(this));
        uint256 token1Balance = token1.balanceOf(address(this));

        int256 shift = _checkVirtualAmountsFormula(token0Amount, token1Amount, token0Balance, token1Balance);
        if (shift > 0) {
            (token0VirtualAmount, token1VirtualAmount) = _getVirtualAmountsForDeposit(token0Amount, token1Amount, token0Balance, token1Balance);
        } else if (shift < 0) {
            (token1VirtualAmount, token0VirtualAmount) = _getVirtualAmountsForDeposit(token1Amount, token0Amount, token1Balance, token0Balance);
        } else {
            (token0VirtualAmount, token1VirtualAmount) = (token0Amount, token1Amount);
        }
    }

    function getRealAmountsForWithdraw(uint256 token0VirtualAmount, uint256 token1VirtualAmount, uint256 token0Balance, uint256 token1Balance, uint256 firstTokenShare) public view returns(uint256 token0RealAmount, uint256 token1RealAmount) {
        uint256 currentToken0Share = token0VirtualAmount * _ONE / (token0VirtualAmount + token1VirtualAmount);
        if (firstTokenShare < currentToken0Share) {
            (token0RealAmount, token1RealAmount) = _getRealAmountsForWithdraw(token0VirtualAmount, token1VirtualAmount, token0Balance - token0VirtualAmount, token1Balance - token1VirtualAmount, firstTokenShare);
        } else if (firstTokenShare > currentToken0Share) {
            (token1RealAmount, token0RealAmount) = _getRealAmountsForWithdraw(token1VirtualAmount, token0VirtualAmount, token1Balance - token1VirtualAmount, token0Balance - token0VirtualAmount, _ONE - firstTokenShare);
        } else {
            (token0RealAmount, token1RealAmount) = (token0VirtualAmount, token1VirtualAmount);
        }
    }

    function deposit(uint256 token0Amount, uint256 token1Amount) external returns(uint256 share) {
        share = depositFor(token0Amount, token1Amount, msg.sender);
    }

    function depositFor(uint256 token0Amount, uint256 token1Amount, address to) public returns(uint256 share) {
        (uint256 token0VirtualAmount, uint256 token1VirtualAmount) = getVirtualAmountsForDeposit(token0Amount, token1Amount);

        uint256 inputAmount = token0VirtualAmount + token1VirtualAmount;
        require(inputAmount > 0, "Empty deposit is not allowed");
        require(to != address(this), "Deposit to this is forbidden");
        // _mint also checks require(to != address(0))

        uint256 _totalSupply = totalSupply();
        if (_totalSupply > 0) {
            uint256 totalBalance = token0.balanceOf(address(this)) + token1.balanceOf(address(this));
            share = inputAmount * _totalSupply / totalBalance;
        } else {
            share = inputAmount;
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

    function withdraw(uint256 amount) external returns(uint256 token0Amount, uint256 token1Amount) {
        (token0Amount, token1Amount) = withdrawFor(amount, msg.sender);
    }

    function withdrawFor(uint256 amount, address to) public returns(uint256 token0Amount, uint256 token1Amount) {
        require(amount > 0, "Empty withdrawal is not allowed");
        require(to != address(this), "Withdrawal to this is forbidden");
        require(to != address(0), "Withdrawal to zero is forbidden");

        uint256 _totalSupply = totalSupply();
        token0Amount = token0.balanceOf(address(this)) * amount / _totalSupply;
        token1Amount = token1.balanceOf(address(this)) * amount / _totalSupply;

        _burn(msg.sender, amount);
        emit Withdrawal(msg.sender, token0Amount, token1Amount, amount);
        if (token0Amount > 0) {
            token0.safeTransfer(to, token0Amount);
        }
        if (token1Amount > 0) {
            token1.safeTransfer(to, token1Amount);
        }
    }

    function withdrawWithRatio(uint256 amount, uint256 firstTokenShare) public returns(uint256 token0Amount, uint256 token1Amount) {
        return withdrawForWithRatio(amount, msg.sender, firstTokenShare);
    }

    function withdrawForWithRatio(uint256 amount, address to, uint256 firstTokenShare) public returns(uint256 token0Amount, uint256 token1Amount) {
        require(amount > 0, "Empty withdrawal is not allowed");
        require(to != address(this), "Withdrawal to this is forbidden");
        require(to != address(0), "Withdrawal to zero is forbidden");
        require(firstTokenShare <= _ONE, "Ratio should be in [0, 1]");

        uint256 _totalSupply = totalSupply();
        uint256 token0Balance = token0.balanceOf(address(this));
        uint256 token1Balance = token1.balanceOf(address(this));
        uint256 token0VirtualAmount = token0Balance * amount / _totalSupply;
        uint256 token1VirtualAmount = token1Balance * amount / _totalSupply;
        (token0Amount, token1Amount) = getRealAmountsForWithdraw(token0VirtualAmount, token1VirtualAmount, token0Balance, token1Balance, firstTokenShare);

        _burn(msg.sender, amount);
        emit Withdrawal(msg.sender, token0Amount, token1Amount, amount);

        if (token0Amount > 0) {
            token0.safeTransfer(to, token0Amount);
        }
        if (token1Amount > 0) {
            token1.safeTransfer(to, token1Amount);
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
