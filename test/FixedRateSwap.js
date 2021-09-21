const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const { gasspectEVM } = require('./helpers/profileEVM');

const FixedRateSwap = artifacts.require('FixedRateSwap');
const TokenMock = artifacts.require('TokenMock');

contract('FixedFeeSwap', function ([_, wallet1, wallet2]) {
    const lpPresicion = ether('0.001');

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

    describe('Arbitrary deposit', async function () {
        let lpBalanceWallet = web3.utils.toBN('0');

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

        it('should be equal to (swap + deposit) {balances, deposit} = {(0,100), (1,0)} part1', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            await this.fixedRateSwap.deposit(ether('1'), 0, { from: wallet1 });
            lpBalanceWallet = await this.fixedRateSwap.balanceOf(wallet1);
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(0,100), (1,0)} part2', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            const outputAmount = await this.fixedRateSwap.contract.methods.swap0To1(ether('1')).call({ from: wallet1 });
            await this.fixedRateSwap.deposit(outputAmount, 0, { from: wallet1 });
            const lpBalance = await this.fixedRateSwap.balanceOf(wallet1);
            const result = lpBalanceWallet.gt(lpBalance) ? lpBalanceWallet.sub(lpBalance) : lpBalance.sub(lpBalanceWallet);
            expect(result).to.be.bignumber.lt(lpPresicion);
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(100,0), (0,1)} part1', async function () {
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            await this.fixedRateSwap.deposit(0, ether('1'), { from: wallet1 });
            lpBalanceWallet = await this.fixedRateSwap.balanceOf(wallet1);
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(100,0), (0,1)} part2', async function () {
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            const outputAmount = await this.fixedRateSwap.contract.methods.swap1To0(ether('1')).call({ from: wallet1 });
            await this.fixedRateSwap.deposit(outputAmount, 0, { from: wallet1 });
            const lpBalance = await this.fixedRateSwap.balanceOf(wallet1);
            const result = lpBalanceWallet.gt(lpBalance) ? lpBalanceWallet.sub(lpBalance) : lpBalance.sub(lpBalanceWallet);
            expect(result).to.be.bignumber.lt(lpPresicion);
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(100,100), (0,1)} part1', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            await this.fixedRateSwap.deposit(0, ether('1'), { from: wallet1 });
            lpBalanceWallet = await this.fixedRateSwap.balanceOf(wallet1);
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(100,100), (0,1)} part2', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            const outputAmount = await this.fixedRateSwap.contract.methods.swap1To0(ether('1')).call({ from: wallet1 });
            await this.fixedRateSwap.deposit(outputAmount, 0, { from: wallet1 });
            const lpBalance = await this.fixedRateSwap.balanceOf(wallet1);
            const result = lpBalanceWallet.gt(lpBalance) ? lpBalanceWallet.sub(lpBalance) : lpBalance.sub(lpBalanceWallet);
            expect(result).to.be.bignumber.lt(lpPresicion);
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(100,100), (1,0)} part1', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            await this.fixedRateSwap.deposit(ether('1'), 0, { from: wallet1 });
            lpBalanceWallet = await this.fixedRateSwap.balanceOf(wallet1);
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(100,100), (1,0)} part2', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            const outputAmount = await this.fixedRateSwap.contract.methods.swap0To1(ether('1')).call({ from: wallet1 });
            await this.fixedRateSwap.deposit(0, outputAmount, { from: wallet1 });
            const lpBalance = await this.fixedRateSwap.balanceOf(wallet1);
            const result = lpBalanceWallet.gt(lpBalance) ? lpBalanceWallet.sub(lpBalance) : lpBalance.sub(lpBalanceWallet);
            expect(result).to.be.bignumber.lt(lpPresicion);
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(100,100), (1,1)} part1', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            await this.fixedRateSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
            lpBalanceWallet = await this.fixedRateSwap.balanceOf(wallet1);
        });

        it('should be equal to (swap + deposit) {balances, deposit} = {(100,100), (1,1)} part2', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            const outputAmount1 = await this.fixedRateSwap.contract.methods.swap0To1(ether('1')).call({ from: wallet1 });
            const outputAmount0 = await this.fixedRateSwap.contract.methods.swap1To0(ether('1')).call({ from: wallet1 });
            await this.fixedRateSwap.deposit(outputAmount0, outputAmount1, { from: wallet1 });
            const lpBalance = await this.fixedRateSwap.balanceOf(wallet1);
            const result = lpBalanceWallet.gt(lpBalance) ? lpBalanceWallet.sub(lpBalance) : lpBalance.sub(lpBalanceWallet);
            expect(result).to.be.bignumber.lt(lpPresicion);
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

            await this.fixedRateSwap.deposit(0, ether('1'), { from: wallet1 });
            const lpBalanceWallet1 = await this.fixedRateSwap.balanceOf(wallet1);
            expect(lpBalanceWallet1).to.be.bignumber.lte(ether('1'));
            expect(ether('1').sub(lpBalanceWallet1)).to.be.bignumber.lt(lpPresicion);
        });

        it('should mint 1 lp when {balances, deposit} = {(0,100), (1,0)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            await this.fixedRateSwap.deposit(ether('1'), 0, { from: wallet1 });
            const lpBalanceWallet1 = await this.fixedRateSwap.balanceOf(wallet1);
            expect(lpBalanceWallet1).to.be.bignumber.lte(ether('1'));
            expect(ether('1').sub(lpBalanceWallet1)).to.be.bignumber.lt(lpPresicion);
        });

        it('should mint 1 lp when {balances, deposit} = {(0,100), (1,1)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            await this.fixedRateSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
            const lpBalanceWallet1 = await this.fixedRateSwap.balanceOf(wallet1);
            expect(lpBalanceWallet1).to.be.bignumber.lte(ether('2'));
            expect(ether('2').sub(lpBalanceWallet1)).to.be.bignumber.lt(lpPresicion);
        });

        it('should mint 1 lp when {balances, deposit} = {(100,0), (0,1)}', async function () {
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            await this.fixedRateSwap.deposit(0, ether('1'), { from: wallet1 });
            const lpBalanceWallet1 = await this.fixedRateSwap.balanceOf(wallet1);
            expect(lpBalanceWallet1).to.be.bignumber.lte(ether('1'));
            expect(ether('1').sub(lpBalanceWallet1)).to.be.bignumber.lt(lpPresicion);
        });

        it('should mint 1 lp when {balances, deposit} = {(100,0), (1,0)}', async function () {
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            await this.fixedRateSwap.deposit(ether('1'), 0, { from: wallet1 });
            const lpBalanceWallet1 = await this.fixedRateSwap.balanceOf(wallet1);
            expect(lpBalanceWallet1).to.be.bignumber.lte(ether('1'));
            expect(ether('1').sub(lpBalanceWallet1)).to.be.bignumber.lt(lpPresicion);
        });

        it('should mint 1 lp when {balances, deposit} = {(100,0), (1,1)}', async function () {
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            await this.fixedRateSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
            const lpBalanceWallet1 = await this.fixedRateSwap.balanceOf(wallet1);
            expect(lpBalanceWallet1).to.be.bignumber.lte(ether('2'));
            expect(ether('2').sub(lpBalanceWallet1)).to.be.bignumber.lt(lpPresicion);
        });

        it('should mint 1 lp when {balances, deposit} = {(100,100), (0,1)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            await this.fixedRateSwap.deposit(0, ether('1'), { from: wallet1 });
            const lpBalanceWallet1 = await this.fixedRateSwap.balanceOf(wallet1);
            expect(lpBalanceWallet1).to.be.bignumber.lte(ether('1'));
            expect(ether('1').sub(lpBalanceWallet1)).to.be.bignumber.lt(lpPresicion);
        });

        it('should mint 1 lp when {balances, deposit} = {(100,100), (1,0)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            await this.fixedRateSwap.deposit(ether('1'), 0, { from: wallet1 });
            const lpBalanceWallet1 = await this.fixedRateSwap.balanceOf(wallet1);
            expect(lpBalanceWallet1).to.be.bignumber.lte(ether('1'));
            expect(ether('1').sub(lpBalanceWallet1)).to.be.bignumber.lt(lpPresicion);
        });

        it('should mint 1 lp when {balances, deposit} = {(100,100), (1,1)}', async function () {
            await this.USDC.mint(this.fixedRateSwap.address, ether('100'));
            await this.USDT.mint(this.fixedRateSwap.address, ether('100'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('100'));
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('0'));

            await this.fixedRateSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
            const lpBalanceWallet1 = await this.fixedRateSwap.balanceOf(wallet1);
            expect(lpBalanceWallet1).to.be.bignumber.lte(ether('2'));
            expect(ether('2').sub(lpBalanceWallet1)).to.be.bignumber.lt(lpPresicion);
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

        it('should be able to exit fully', async function () {
            await this.fixedRateSwap.withdraw(ether('2'), { from: wallet1 });
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal('0');
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDT.balanceOf(wallet1)).to.be.bignumber.equal(ether('10'));
            expect(await this.USDC.balanceOf(wallet1)).to.be.bignumber.equal(ether('10'));
        });

        it('should be able to exit partially', async function () {
            await this.fixedRateSwap.withdraw(ether('1'), { from: wallet1 });
            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('1'));
            expect(await this.USDT.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('0.5'));
            expect(await this.USDC.balanceOf(this.fixedRateSwap.address)).to.be.bignumber.equal(ether('0.5'));
            expect(await this.USDT.balanceOf(wallet1)).to.be.bignumber.equal(ether('9.5'));
            expect(await this.USDC.balanceOf(wallet1)).to.be.bignumber.equal(ether('9.5'));
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
