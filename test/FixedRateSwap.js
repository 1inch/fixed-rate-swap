const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const { gasspectEVM } = require('./helpers/profileEVM');
const { assertRoughlyEqualValues, toBN } = require('./helpers/utils');

const FixedRateSwap = artifacts.require('FixedRateSwap');
const TokenMock = artifacts.require('TokenMock');

contract('FixedFeeSwap', function ([_, wallet1, wallet2]) {
    const precision = 0.01;

    beforeEach(async function () {
        this.USDT = await TokenMock.new('USDT', 'USDT');
        this.USDC = await TokenMock.new('USDC', 'USDC');
        this.fixedRateSwap = await FixedRateSwap.new(this.USDT.address, this.USDC.address, 'FixedRateSwap', 'FRS', 18);
        await this.fixedRateSwap.transferOwnership(wallet1);
        await this.USDT.mint(wallet1, ether('10'));
        await this.USDT.mint(wallet2, ether('10'));
        await this.USDC.mint(wallet1, ether('10'));
        await this.USDC.mint(wallet2, ether('10'));
        await this.USDT.approve(this.fixedRateSwap.address, ether('10'), { from: wallet1 });
        await this.USDC.approve(this.fixedRateSwap.address, ether('10'), { from: wallet1 });
        await this.USDT.approve(this.fixedRateSwap.address, ether('10'), { from: wallet2 });
        await this.USDC.approve(this.fixedRateSwap.address, ether('10'), { from: wallet2 });
    });

    describe('Arbitrary withdrawal', async function () {
        beforeEach(async function () {
            await this.fixedRateSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
        });

        it('should be equal to (withdraw + swap) {1:9}', async function () {
            // arbitrary withdraw
            const arbitraryBalances = await this.fixedRateSwap.contract.methods.withdrawWithRatio(ether('1'), ether('0.1')).call({ from: wallet1 });

            // withdraw + swap
            const balances = await this.fixedRateSwap.contract.methods.withdraw(ether('1')).call({ from: wallet1 });
            await this.fixedRateSwap.contract.methods.withdraw(ether('1')).send({ from: wallet1 });

            const swapAmount = ether('0.4');
            const token1Amount = await this.fixedRateSwap.contract.methods.swap0To1(swapAmount).call({ from: wallet1 });
            assertRoughlyEqualValues(toBN(arbitraryBalances.token0Amount), toBN(balances.token0Amount).sub(swapAmount), precision);
            assertRoughlyEqualValues(toBN(arbitraryBalances.token1Amount), toBN(balances.token1Amount).add(toBN(token1Amount)), precision);
        });

        it('should be equal to (withdraw + swap) {9:1}', async function () {
            // arbitrary withdraw
            const arbitraryBalances = await this.fixedRateSwap.contract.methods.withdrawWithRatio(ether('1'), ether('0.9')).call({ from: wallet1 });

            // withdraw + swap
            const balances = await this.fixedRateSwap.contract.methods.withdraw(ether('1')).call({ from: wallet1 });
            await this.fixedRateSwap.contract.methods.withdraw(ether('1')).send({ from: wallet1 });

            const swapAmount = ether('0.4');
            const token0Amount = await this.fixedRateSwap.contract.methods.swap1To0(swapAmount).call({ from: wallet1 });
            assertRoughlyEqualValues(toBN(arbitraryBalances.token0Amount), toBN(balances.token0Amount).add(toBN(token0Amount)), precision);
            assertRoughlyEqualValues(toBN(arbitraryBalances.token1Amount), toBN(balances.token1Amount).sub(swapAmount), precision);
        });

        it('should be equal to (withdraw + swap) {1:1}', async function () {
            // arbitrary withdraw
            const arbitraryBalances = await this.fixedRateSwap.contract.methods.withdrawWithRatio(ether('1'), ether('0.5')).call({ from: wallet1 });

            // withdraw + swap
            const balances = await this.fixedRateSwap.contract.methods.withdraw(ether('1')).call({ from: wallet1 });
            await this.fixedRateSwap.contract.methods.withdraw(ether('1')).send({ from: wallet1 });
            assertRoughlyEqualValues(toBN(arbitraryBalances.token0Amount), toBN(balances.token0Amount), precision);
            assertRoughlyEqualValues(toBN(arbitraryBalances.token1Amount), toBN(balances.token1Amount), precision);
        });

        it('should be equal to (withdraw + swap) {0:1}', async function () {
            // arbitrary withdraw
            const arbitraryBalances = await this.fixedRateSwap.contract.methods.withdrawWithRatio(ether('1'), ether('0')).call({ from: wallet1 });

            // withdraw + swap
            const balances = await this.fixedRateSwap.contract.methods.withdraw(ether('1')).call({ from: wallet1 });
            const swapAmount = ether('0.5');
            const token1Amount = await this.fixedRateSwap.contract.methods.swap0To1(swapAmount).call({ from: wallet1 });
            assertRoughlyEqualValues(toBN(arbitraryBalances.token0Amount), toBN(balances.token0Amount).sub(swapAmount), precision);
            assertRoughlyEqualValues(toBN(arbitraryBalances.token1Amount), toBN(balances.token1Amount).add(toBN(token1Amount)), precision);
        });
    });

    describe('Arbitrary deposit', async function () {
        it('should be error input amount is too big {balances, deposit} = {(0,100), (0,1)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));
            await expectRevert(
                this.fixedRateSwap.swap1To0(ether('1'), { from: wallet1 }),
                'input amount is too big',
            );
        });

        it('should be error input amount is too big {balances, deposit} = {(100,0), (1,0)}', async function () {
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));
            await expectRevert(
                this.fixedRateSwap.swap0To1(ether('1'), { from: wallet1 }),
                'input amount is too big',
            );
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(0,100), (1,0)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            // arbitrary deposit
            const lpBalanceWallet = await this.fixedRateSwap.contract.methods.deposit(ether('1'), 0).call({ from: wallet1 });
            const arbitraryLpBalance = web3.utils.toBN(lpBalanceWallet);

            // swap + deposit
            const outputAmount = await this.fixedRateSwap.contract.methods.swap0To1(ether('1')).call({ from: wallet1 });
            await this.fixedRateSwap.contract.methods.swap0To1(ether('1')).send({ from: wallet1 });
            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(outputAmount, 0).call({ from: wallet1 });
            assertRoughlyEqualValues(arbitraryLpBalance, lpBalance, precision);
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(100,0), (0,1)}', async function () {
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            // arbitrary deposit
            const lpBalanceWallet = await this.fixedRateSwap.contract.methods.deposit(0, ether('1')).call({ from: wallet1 });
            const arbitraryLpBalance = web3.utils.toBN(lpBalanceWallet);

            // swap + deposit
            const outputAmount = await this.fixedRateSwap.contract.methods.swap1To0(ether('1')).call({ from: wallet1 });
            await this.fixedRateSwap.contract.methods.swap1To0(ether('1')).send({ from: wallet1 });
            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(outputAmount, 0).call({ from: wallet1 });
            assertRoughlyEqualValues(arbitraryLpBalance, lpBalance, precision);
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(100,100), (0,1)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            // arbitrary deposit
            const lpBalanceWallet = await this.fixedRateSwap.contract.methods.deposit(0, ether('1')).call({ from: wallet1 });
            const arbitraryLpBalance = web3.utils.toBN(lpBalanceWallet);

            // swap + deposit
            const outputAmount = await this.fixedRateSwap.contract.methods.swap1To0(ether('1')).call({ from: wallet1 });
            await this.fixedRateSwap.contract.methods.swap1To0(ether('1')).send({ from: wallet1 });
            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(outputAmount, 0).call({ from: wallet1 });
            assertRoughlyEqualValues(arbitraryLpBalance, lpBalance, precision);
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(100,100), (1,0)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            // arbitrary deposit
            const lpBalanceWallet = await this.fixedRateSwap.contract.methods.deposit(ether('1'), 0).call({ from: wallet1 });
            const arbitraryLpBalance = web3.utils.toBN(lpBalanceWallet);

            // swap + deposit
            const outputAmount = await this.fixedRateSwap.contract.methods.swap0To1(ether('1')).call({ from: wallet1 });
            await this.fixedRateSwap.contract.methods.swap0To1(ether('1')).send({ from: wallet1 });
            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(outputAmount, 0).call({ from: wallet1 });
            assertRoughlyEqualValues(arbitraryLpBalance, lpBalance, precision);
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(100,100), (1,1)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            // arbitrary deposit
            const lpBalanceWallet = await this.fixedRateSwap.contract.methods.deposit(ether('1'), ether('1')).call({ from: wallet1 });
            const arbitraryLpBalance = web3.utils.toBN(lpBalanceWallet);

            // swap + deposit
            const outputAmount1 = await this.fixedRateSwap.contract.methods.swap0To1(ether('1')).call({ from: wallet1 });
            await this.fixedRateSwap.contract.methods.swap0To1(ether('1')).send({ from: wallet1 });
            const outputAmount0 = await this.fixedRateSwap.contract.methods.swap1To0(ether('1')).call({ from: wallet1 });
            await this.fixedRateSwap.contract.methods.swap1To0(ether('1')).send({ from: wallet1 });
            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(outputAmount0, outputAmount1).call({ from: wallet1 });
            assertRoughlyEqualValues(arbitraryLpBalance, lpBalance, precision);
        });
    });

    describe('Deposits', async function () {
        it('should be cheap', async function () {
            await this.fixedRateSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
            await this.fixedRateSwap.deposit(ether('0.5'), ether('1'), { from: wallet1 });
            await this.fixedRateSwap.deposit(ether('1'), ether('0.5'), { from: wallet1 });
            await this.fixedRateSwap.deposit(ether('1'), ether('0'), { from: wallet1 });
            const receipt = await this.fixedRateSwap.deposit(ether('0'), ether('1'), { from: wallet1 });
            console.log(receipt);
            gasspectEVM(receipt.tx);
        });

        it('should mint 1 lp when {balances, deposit} = {(0,100), (0,1)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(0, ether('1')).call({ from: wallet1 });
            assertRoughlyEqualValues(toBN(lpBalance), ether('1'), precision);
        });

        it('should mint 1 lp when {balances, deposit} = {(0,100), (1,0)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(ether('1'), 0).call({ from: wallet1 });
            assertRoughlyEqualValues(toBN(lpBalance), ether('1'), precision);
        });

        it('should mint 1 lp when {balances, deposit} = {(0,100), (1,1)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(ether('1'), ether('1')).call({ from: wallet1 });
            assertRoughlyEqualValues(toBN(lpBalance), ether('2'), precision);
        });

        it('should mint 1 lp when {balances, deposit} = {(100,0), (0,1)}', async function () {
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(0, ether('1')).call({ from: wallet1 });
            assertRoughlyEqualValues(toBN(lpBalance), ether('1'), precision);
        });

        it('should mint 1 lp when {balances, deposit} = {(100,0), (1,0)}', async function () {
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(ether('1'), 0).call({ from: wallet1 });
            assertRoughlyEqualValues(toBN(lpBalance), ether('1'), precision);
        });

        it('should mint 1 lp when {balances, deposit} = {(100,0), (1,1)}', async function () {
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(ether('1'), ether('1')).call({ from: wallet1 });
            assertRoughlyEqualValues(toBN(lpBalance), ether('2'), precision);
        });

        it('should mint 1 lp when {balances, deposit} = {(100,100), (0,1)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(0, ether('1')).call({ from: wallet1 });
            assertRoughlyEqualValues(toBN(lpBalance), ether('1'), precision);
        });

        it('should mint 1 lp when {balances, deposit} = {(100,100), (1,0)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(ether('1'), 0).call({ from: wallet1 });
            assertRoughlyEqualValues(toBN(lpBalance), ether('1'), precision);
        });

        it('should mint 1 lp when {balances, deposit} = {(100,100), (1,1)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            const lpBalance = await this.fixedRateSwap.contract.methods.deposit(ether('1'), ether('1')).call({ from: wallet1 });
            assertRoughlyEqualValues(toBN(lpBalance), ether('2'), precision);
        });

        it('should be denied for zero amount', async function () {
            await expectRevert(
                this.fixedRateSwap.deposit(ether('0'), ether('0'), { from: wallet1 }),
                'Empty deposit is not allowed',
            );
        });

        it('should be allowed for owner', async function () {
            await this.fixedRateSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('2'));
        });

        it('should give the same shares for the same deposits', async function () {
            await this.fixedRateSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('2'));
            await this.fixedRateSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('4'));
        });
    });

    describe('Withdrawals', async function () {
        beforeEach(async function () {
            await this.fixedRateSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
        });

        it('should be able to withdraw fully', async function () {
            await this.fixedRateSwap.withdraw(ether('2'), { from: wallet1 });
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal('0');
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDT.balanceOf(wallet1)).to.be.bignumber.equal(ether('10'));
            expect(await this.USDC.balanceOf(wallet1)).to.be.bignumber.equal(ether('10'));
        });

        it('should be able to withdraw partially', async function () {
            await this.fixedRateSwap.withdraw(ether('1'), { from: wallet1 });
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('1'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('0.5'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('0.5'));
            expect(await this.USDT.balanceOf(wallet1)).to.be.bignumber.equal(ether('9.5'));
            expect(await this.USDC.balanceOf(wallet1)).to.be.bignumber.equal(ether('9.5'));
        });

        it('should be able to withdraw with 1:1', async function () {
            await this.fixedRateSwap.withdrawWithRatio(ether('1'), ether('0.5'), { from: wallet1 });
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('1'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('0.5'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('0.5'));
            expect(await this.USDT.balanceOf(wallet1)).to.be.bignumber.equal(ether('9.5'));
            expect(await this.USDC.balanceOf(wallet1)).to.be.bignumber.equal(ether('9.5'));
        });

        it('should be able to withdraw with 1:9', async function () {
            await this.fixedRateSwap.withdrawWithRatio(ether('1'), ether('0.1'), { from: wallet1 });
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('1'));
            assertRoughlyEqualValues(ether('0.9'), await this.USDT.balanceOf(this.fixedRateSwap.address), precision);
            assertRoughlyEqualValues(ether('0.1'), await this.USDC.balanceOf(this.fixedRateSwap.address), precision);
            assertRoughlyEqualValues(ether('9.1'), await this.USDT.balanceOf(wallet1), precision);
            assertRoughlyEqualValues(ether('9.9'), await this.USDC.balanceOf(wallet1), precision);
        });

        it('should be able to withdraw with 9:1', async function () {
            await this.fixedRateSwap.withdrawWithRatio(ether('1'), ether('0.9'), { from: wallet1 });
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('1'));
            assertRoughlyEqualValues(ether('0.1'), await this.USDT.balanceOf(this.fixedRateSwap.address), precision);
            assertRoughlyEqualValues(ether('0.9'), await this.USDC.balanceOf(this.fixedRateSwap.address), precision);
            assertRoughlyEqualValues(ether('9.9'), await this.USDT.balanceOf(wallet1), precision);
            assertRoughlyEqualValues(ether('9.1'), await this.USDC.balanceOf(wallet1), precision);
        });

        it('should be able to withdraw with 1:0', async function () {
            await this.fixedRateSwap.withdrawWithRatio(ether('1'), ether('1'), { from: wallet1 });
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('1'));
            assertRoughlyEqualValues(ether('0.000107'), await this.USDT.balanceOf(this.fixedRateSwap.address), precision);
            assertRoughlyEqualValues(ether('1'), await this.USDC.balanceOf(this.fixedRateSwap.address), precision);
            assertRoughlyEqualValues(ether('10'), await this.USDT.balanceOf(wallet1), precision);
            assertRoughlyEqualValues(ether('9'), await this.USDC.balanceOf(wallet1), precision);
        });

        it('should be able to withdraw with 0:1', async function () {
            await this.fixedRateSwap.withdrawWithRatio(ether('1'), ether('0'), { from: wallet1 });
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('1'));
            assertRoughlyEqualValues(ether('1'), await this.USDT.balanceOf(this.fixedRateSwap.address), precision);
            assertRoughlyEqualValues(ether('0.000107'), await this.USDC.balanceOf(this.fixedRateSwap.address), precision);
            assertRoughlyEqualValues(ether('9'), await this.USDT.balanceOf(wallet1), precision);
            assertRoughlyEqualValues(ether('10'), await this.USDC.balanceOf(wallet1), precision);
        });

        it('should revert when withdraw too much', async function () {
            await expectRevert(
                this.fixedRateSwap.withdraw(ether('3'), { from: wallet1 }),
                'ERC20: burn amount exceeds balance',
            );
        });

        it('should revert when withdraw too much in one token', async function () {
            await expectRevert(
                this.fixedRateSwap.withdrawWithRatio(ether('2'), ether('0'), { from: wallet1 }),
                'Amount exceeds total balance',
            );
        });

        it.skip('deposit/withdraw should be more expensive than swap', async function () {
            const swapResult = await this.fixedRateSwap.contract.methods.swap0To1(ether('1')).call({ from: wallet2 });
            const depositResult = await this.fixedRateSwap.contract.methods.deposit(ether('1'), ether('0')).call({ from: wallet2 });
            await this.fixedRateSwap.deposit(ether('1'), ether('0'), { from: wallet2 });
            const withdrawResult = await this.fixedRateSwap.contract.methods.withdrawWithRatio(depositResult, ether('0')).call({ from: wallet2 });
            expect(withdrawResult.token1Amount).to.be.bignumber.lt(swapResult);
        });
    });

    describe('Swaps', async function () {
        beforeEach(async function () {
            await this.fixedRateSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
        });

        it('should swap directly', async function () {
            await this.fixedRateSwap.swap0To1(ether('1'), { from: wallet2 });
            expect(await this.USDT.balanceOf(wallet2)).to.bignumber.equal(ether('9'));
            expect(await this.USDC.balanceOf(wallet2)).to.bignumber.equal(ether('10.999785325996316875'));
        });

        it('should swap inversly', async function () {
            await this.fixedRateSwap.swap1To0(ether('1'), { from: wallet2 });
            expect(await this.USDC.balanceOf(wallet2)).to.bignumber.equal(ether('9'));
            expect(await this.USDT.balanceOf(wallet2)).to.bignumber.equal(ether('10.999785325996316875'));
        });
    });

    it('should withdraw all after swap', async function () {
        await this.fixedRateSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
        await this.fixedRateSwap.swap0To1(ether('1'), { from: wallet2 });
        await this.fixedRateSwap.withdraw(ether('2'), { from: wallet1 });
        expect(await this.USDT.balanceOf(wallet1)).to.be.bignumber.equal(ether('11'));
        expect(await this.USDC.balanceOf(wallet1)).to.be.bignumber.equal(ether('9.000214674003683125'));
    });
});
