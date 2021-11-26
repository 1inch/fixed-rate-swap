const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const { gasspectEVM } = require('./helpers/profileEVM');
const { assertRoughlyEqualValues, toBN } = require('./helpers/utils');

const FixedRateSwap = artifacts.require('FixedRateSwap');
const TokenMock = artifacts.require('TokenMock');

contract('FixedRateSwap', function ([wallet1, wallet2]) {
    const arbitraryPrecision = '0.0000000000000001'; // 1e-16
    const precision = '0.001';
    const swapAmount = ether('1');
    const feeAmount = toBN('214674003683125');

    before(async function () {
        this.USDT = await TokenMock.new('USDT', 'USDT');
        this.USDC = await TokenMock.new('USDC', 'USDC');
        this.fixedRateSwap = await FixedRateSwap.new(this.USDT.address, this.USDC.address, 'FixedRateSwap', 'FRS', 18);
    });

    beforeEach(async function () {
        for (const addr of [wallet1, wallet2]) {
            for (const token of [this.USDT, this.USDC]) {
                await token.mint(addr, ether('1000'));
                await token.approve(this.fixedRateSwap.address, ether('1000'), { from: addr });
            }
        }
    });

    afterEach(async function () {
        for (const addr of [wallet1, wallet2]) {
            const p = await this.fixedRateSwap.balanceOf(addr);
            if (!p.isZero()) {
                await this.fixedRateSwap.withdraw(p, '0', '0', { from: addr });
            }
            for (const token of [this.USDT, this.USDC]) {
                const b = await token.balanceOf(addr);
                if (!b.isZero()) {
                    await token.burn(addr, b);
                }
            }
        }
    });

    describe('Arbitrary withdrawal', async function () {
        beforeEach(async function () {
            await this.fixedRateSwap.deposit(ether('1'), ether('1'), '0');
        });

        it('should be equal to (withdraw + swap) {1:9}', async function () {
            // arbitrary withdraw
            const arbitraryBalances = await this.fixedRateSwap.contract.methods.withdrawWithRatio(ether('1'), ether('0.1'), '0', '0').call();

            // withdraw + swap
            const balances = await this.fixedRateSwap.contract.methods.withdraw(ether('1'), '0', '0').call();
            await this.fixedRateSwap.withdraw(ether('1'), '0', '0');

            const swapAmount = ether('0.400004147274109535');
            const token1Amount = await this.fixedRateSwap.contract.methods.swap0To1(swapAmount, '0').call();

            assertRoughlyEqualValues(toBN(arbitraryBalances.token0Amount), toBN(balances.token0Amount).sub(swapAmount), arbitraryPrecision);
            assertRoughlyEqualValues(toBN(arbitraryBalances.token1Amount), toBN(balances.token1Amount).add(toBN(token1Amount)), arbitraryPrecision);
            assertRoughlyEqualValues(
                toBN(1e18).mul(toBN(balances.token0Amount).sub(swapAmount)).div(toBN(balances.token1Amount).add(toBN(token1Amount))),
                toBN(1e18).muln(1).divn(9),
                arbitraryPrecision,
            );
        });

        it('should be equal to (withdraw + swap) {9:1}', async function () {
            // arbitrary withdraw
            const arbitraryBalances = await this.fixedRateSwap.contract.methods.withdrawWithRatio(ether('1'), ether('0.9'), '0', '0').call();

            // withdraw + swap
            const balances = await this.fixedRateSwap.contract.methods.withdraw(ether('1'), '0', '0').call();
            await this.fixedRateSwap.withdraw(ether('1'), '0', '0');

            const swapAmount = ether('0.400004147274109535');
            const token0Amount = await this.fixedRateSwap.contract.methods.swap1To0(swapAmount, '0').call();

            assertRoughlyEqualValues(toBN(arbitraryBalances.token0Amount), toBN(balances.token0Amount).add(toBN(token0Amount)), arbitraryPrecision);
            assertRoughlyEqualValues(toBN(arbitraryBalances.token1Amount), toBN(balances.token1Amount).sub(swapAmount), arbitraryPrecision);
            assertRoughlyEqualValues(
                toBN(1e18).mul(toBN(balances.token0Amount).add(toBN(token0Amount))).div(toBN(balances.token1Amount).sub(swapAmount)),
                toBN(1e18).muln(9).divn(1),
                arbitraryPrecision,
            );
        });

        it('should be equal to (withdraw + swap) {0:1}', async function () {
            // arbitrary withdraw
            const arbitraryBalances = await this.fixedRateSwap.contract.methods.withdrawWithRatio(ether('1'), ether('0'), '0', '0').call();

            // withdraw + swap
            const balances = await this.fixedRateSwap.contract.methods.withdraw(ether('1'), '0', '0').call();
            await this.fixedRateSwap.withdraw(ether('1'), '0', '0');

            const swapAmount = ether('0.5');
            const token1Amount = await this.fixedRateSwap.contract.methods.swap0To1(swapAmount, '0').call();

            assertRoughlyEqualValues(toBN(arbitraryBalances.token0Amount), toBN(balances.token0Amount).sub(swapAmount), arbitraryPrecision);
            assertRoughlyEqualValues(toBN(arbitraryBalances.token1Amount), toBN(balances.token1Amount).add(toBN(token1Amount)), arbitraryPrecision);
            assertRoughlyEqualValues(toBN(arbitraryBalances.token0Amount), toBN('0'), arbitraryPrecision);
        });

        it('should be equal to (withdraw + swap) {1:1}', async function () {
            // arbitrary withdraw
            const arbitraryBalances = await this.fixedRateSwap.contract.methods.withdrawWithRatio(ether('1'), ether('0.5'), '0', '0').call();

            // withdraw
            const balances = await this.fixedRateSwap.contract.methods.withdraw(ether('1'), '0', '0').call();

            expect(arbitraryBalances.token0Amount).to.bignumber.equal(balances.token0Amount);
            expect(arbitraryBalances.token1Amount).to.bignumber.equal(balances.token1Amount);
        });
    });

    describe('Arbitrary deposit', async function () {
        async function swap0to1Test (token0Balance, token1Balance, token0Deposit, token1Deposit, swapAmount) {
            await this.fixedRateSwap.deposit(token0Balance, token1Balance, '0');
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(token0Balance);
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(token1Balance);

            // arbitrary deposit
            const lpBalanceWallet = await this.fixedRateSwap.contract.methods.deposit(token0Deposit, token1Deposit, '0').call();
            const arbitraryLpBalance = toBN(lpBalanceWallet);

            // swap + deposit
            const outputAmount = await this.fixedRateSwap.contract.methods.swap0To1(swapAmount, '0').call();
            await this.fixedRateSwap.contract.methods.swap0To1(swapAmount, '0').send({ from: wallet1 });

            const balance0 = await this.USDT.balanceOf(this.fixedRateSwap.address);
            const balance1 = await this.USDC.balanceOf(this.fixedRateSwap.address);
            assertRoughlyEqualValues(
                toBN(1e18).mul(toBN(outputAmount)).div(token0Deposit.sub(swapAmount)),
                toBN(1e18).mul(balance1).div(balance0),
                arbitraryPrecision,
            );

            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(token0Deposit.sub(swapAmount), outputAmount, '0').call();
            assertRoughlyEqualValues(arbitraryLpBalance, lpBalance, arbitraryPrecision);
        };

        async function swap1to0Test (token0Balance, token1Balance, token0Deposit, token1Deposit, swapAmount) {
            await this.fixedRateSwap.deposit(token0Balance, token1Balance, '0');
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(token0Balance);
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(token1Balance);

            // arbitrary deposit
            const lpBalanceWallet = await this.fixedRateSwap.contract.methods.deposit(token0Deposit, token1Deposit, '0').call();
            const arbitraryLpBalance = web3.utils.toBN(lpBalanceWallet);

            // swap + deposit
            const outputAmount = await this.fixedRateSwap.contract.methods.swap1To0(swapAmount, '0').call();
            await this.fixedRateSwap.contract.methods.swap1To0(swapAmount, '0').send({ from: wallet1 });

            const balance0 = await this.USDT.balanceOf(this.fixedRateSwap.address);
            const balance1 = await this.USDC.balanceOf(this.fixedRateSwap.address);
            assertRoughlyEqualValues(
                toBN(1e18).mul(toBN(outputAmount)).div(token1Deposit.sub(swapAmount)),
                toBN(1e18).mul(balance0).div(balance1),
                arbitraryPrecision,
            );

            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(outputAmount, token1Deposit.sub(swapAmount), '0').call();
            assertRoughlyEqualValues(arbitraryLpBalance, lpBalance, arbitraryPrecision);
        };

        it('should be equal to (swap + deposit) {balances, deposit} = {(0,100), (1,0)}', async function () {
            await swap0to1Test.call(this, ether('0'), ether('100'), ether('1'), ether('0'), ether('0.990099171224324018'));
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(100,0), (0,1)}', async function () {
            await swap1to0Test.call(this, ether('100'), ether('0'), ether('0'), ether('1'), ether('0.990099171224324018'));
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(100,100), (0,1)}', async function () {
            await swap1to0Test.call(this, ether('100'), ether('100'), ether('0'), ether('1'), ether('0.497537438448399645'));
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(100,100), (1,0)}', async function () {
            await swap0to1Test.call(this, ether('100'), ether('100'), ether('1'), ether('0'), ether('0.497537438448399645'));
        });
    });

    describe('Deposits', async function () {
        it.skip('should be cheap', async function () {
            await this.fixedRateSwap.deposit(ether('1'), ether('1'), '0');
            await this.fixedRateSwap.deposit(ether('0.5'), ether('1'), '0');
            await this.fixedRateSwap.deposit(ether('1'), ether('0.5'), '0');
            await this.fixedRateSwap.deposit(ether('1'), ether('0'), '0');
            const receipt = await this.fixedRateSwap.deposit(ether('0'), ether('1'), '0');
            gasspectEVM(receipt.tx);
        });

        describe('mint lp', async function () {
            const tests = [
                ['0', '100', '0', '1', '1'],
                ['0', '100', '1', '0', '1'],
                ['0', '100', '1', '1', '2'],
                ['100', '0', '1', '0', '1'],
                ['100', '0', '0', '1', '1'],
                ['100', '0', '1', '1', '2'],
                ['100', '100', '1', '0', '1'],
                ['100', '100', '0', '1', '1'],
                ['100', '100', '1', '1', '2'],
            ];

            tests.forEach(test => {
                it(`should mint ${test[4]} lp when {balances, deposit} = {(${test[0]}, ${test[1]}), (${test[2]}, ${test[3]})}`, async function () {
                    const usdtBalance = ether(test[0]);
                    const usdcBalance = ether(test[1]);
                    const usdtDeposit = ether(test[2]);
                    const usdcDeposit = ether(test[3]);
                    const lpResult = ether(test[4]);

                    await this.fixedRateSwap.deposit(usdtBalance, usdcBalance, '0');
                    expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(usdtBalance);
                    expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(usdcBalance);

                    await this.fixedRateSwap.deposit(usdtDeposit, usdcDeposit, '0', { from: wallet2 });
                    assertRoughlyEqualValues(await this.fixedRateSwap.balanceOf(wallet2), lpResult, precision);
                });
            });
        });

        it('should be denied for zero amount', async function () {
            await expectRevert(
                this.fixedRateSwap.deposit(ether('0'), ether('0'), '0'),
                'Empty deposit is not allowed',
            );
        });

        it('should give the same shares for the same deposits', async function () {
            await this.fixedRateSwap.deposit(ether('1'), ether('1'), '0');
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('2'));
            await this.fixedRateSwap.deposit(ether('1'), ether('1'), '0');
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('4'));
        });
    });

    describe('Withdrawals', async function () {
        beforeEach(async function () {
            this.usdtBalanceBefore = await this.USDT.balanceOf(wallet1);
            this.usdcBalanceBefore = await this.USDC.balanceOf(wallet1);
            await this.fixedRateSwap.deposit(ether('1'), ether('1'), '0');
        });

        it('should be able to withdraw fully', async function () {
            await this.fixedRateSwap.withdraw(ether('2'), '0', '0');
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal('0');
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDT.balanceOf(wallet1)).to.be.bignumber.equal(this.usdtBalanceBefore);
            expect(await this.USDC.balanceOf(wallet1)).to.be.bignumber.equal(this.usdcBalanceBefore);
        });

        it('should be able to withdraw partially', async function () {
            await this.fixedRateSwap.withdraw(ether('1'), '0', '0');
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('1'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('0.5'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('0.5'));
            expect(await this.USDT.balanceOf(wallet1)).to.be.bignumber.equal(this.usdtBalanceBefore.sub(ether('0.5')));
            expect(await this.USDC.balanceOf(wallet1)).to.be.bignumber.equal(this.usdcBalanceBefore.sub(ether('0.5')));
        });

        describe('ratio withdrawals', async function () {
            const tests = [
                ['1', '1', '0', '0'],
                ['1', '9', '4147274109535', '37325466985822'],
                ['9', '1', '37325466985822', '4147274109535'],
                ['1', '0', '107337001841563', '0'],
                ['0', '1', '0', '107337001841563'],
            ];
            const withdrawalAmount = ether('1');

            tests.forEach(test => {
                it(`should be able to withdraw with ${test[0]}:${test[1]}`, async function () {
                    const token0Amount = ether(test[0]).div(toBN(test[0]).add(toBN(test[1])));
                    const token1Amount = ether(test[1]).div(toBN(test[0]).add(toBN(test[1])));
                    await this.fixedRateSwap.withdrawWithRatio(withdrawalAmount, token0Amount, '0', '0');
                    expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(withdrawalAmount);
                    const token0Fee = toBN(test[2]);
                    const token1Fee = toBN(test[3]);
                    expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.bignumber.equal(ether('1').sub(token0Amount).add(token0Fee));
                    expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.bignumber.equal(ether('1').sub(token1Amount).add(token1Fee));
                });
            });
        });

        it('should revert when withdraw too much', async function () {
            await expectRevert(
                this.fixedRateSwap.withdraw(ether('3'), '0', '0'),
                'ERC20: burn amount exceeds balance',
            );
        });

        it('should revert when withdraw too much in one token', async function () {
            await expectRevert(
                this.fixedRateSwap.withdrawWithRatio(ether('2'), ether('0'), '0', '0'),
                'Amount exceeds total balance',
            );
        });

        it('should withdraw all after swap', async function () {
            await this.fixedRateSwap.swap0To1(swapAmount, '0', { from: wallet2 });
            await this.fixedRateSwap.withdraw(ether('2'), '0', '0');
            expect(await this.USDT.balanceOf(wallet1)).to.be.bignumber.equal(this.usdtBalanceBefore.add(swapAmount));
            expect(await this.USDC.balanceOf(wallet1)).to.be.bignumber.equal(this.usdcBalanceBefore.sub(swapAmount).add(feeAmount));
        });
    });

    describe('Swaps', async function () {
        beforeEach(async function () {
            await this.fixedRateSwap.deposit(ether('1'), ether('1'), '0');
            this.usdtBalanceBefore = await this.USDT.balanceOf(wallet1);
            this.usdcBalanceBefore = await this.USDC.balanceOf(wallet1);
        });

        it('should swap directly', async function () {
            await this.fixedRateSwap.swap0To1(swapAmount, '0');
            expect(await this.USDT.balanceOf(wallet1)).to.bignumber.equal(this.usdtBalanceBefore.sub(swapAmount));
            expect(await this.USDC.balanceOf(wallet1)).to.bignumber.equal(this.usdcBalanceBefore.add(swapAmount).sub(feeAmount));
        });

        it('should swap inversly', async function () {
            await this.fixedRateSwap.swap1To0(swapAmount, '0');
            expect(await this.USDC.balanceOf(wallet1)).to.bignumber.equal(this.usdcBalanceBefore.sub(swapAmount));
            expect(await this.USDT.balanceOf(wallet1)).to.bignumber.equal(this.usdtBalanceBefore.add(swapAmount).sub(feeAmount));
        });

        it('should error with "input amount is too big"', async function () {
            await expectRevert(
                this.fixedRateSwap.swap1To0(ether('2'), '0'),
                'Input amount is too big',
            );
        });

        it('should be error input amount is too big {balances, deposit} = {(100,0), (1,0)}', async function () {
            await expectRevert(
                this.fixedRateSwap.swap0To1(ether('2'), '0'),
                'Input amount is too big',
            );
        });
    });

    it('deposit/withdraw should be more expensive than swap', async function () {
        await this.fixedRateSwap.deposit(ether('100'), ether('100'), '0');
        const swapResult = await this.fixedRateSwap.contract.methods.swap0To1(swapAmount, '0').call({ from: wallet2 });
        const depositResult = await this.fixedRateSwap.contract.methods.deposit(swapAmount, '0', '0').call({ from: wallet2 });
        await this.fixedRateSwap.deposit(swapAmount, '0', '0', { from: wallet2 });
        const withdrawResult = await this.fixedRateSwap.contract.methods.withdrawWithRatio(depositResult, ether('0'), '0', '0').call({ from: wallet2 });
        expect(withdrawResult.token1Amount).to.be.bignumber.lt(swapResult);
    });
});
