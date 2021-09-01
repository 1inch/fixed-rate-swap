const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const FixedRateSwap = artifacts.require('FixedRateSwap');
const TokenMock = artifacts.require('TokenMock');

contract('FixedFeeSwap', function ([_, wallet1, wallet2]) {
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

    describe('GetReturn', async function () {
        it('should be cheap', async function () {
            await this.fixedRateSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
            await this.fixedRateSwap.contract.methods.getReturn(this.USDC.address, this.USDT.address, ether('1')).send({ from: _ });
            await this.fixedRateSwap.contract.methods._getReturn(ether('1'), ether('1'), ether('1')).send({ from: _ });

            expect(await this.fixedRateSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('2'));
        });
    });

    describe('Deposits', async function () {
        it('should be cheap', async function () {
            await this.fixedRateSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
            await this.fixedRateSwap.deposit(ether('0.5'), ether('1'), { from: wallet1 });
            await this.fixedRateSwap.deposit(ether('1'), ether('0.5'), { from: wallet1 });
            await this.fixedRateSwap.deposit(ether('1'), ether('0'), { from: wallet1 });
            await this.fixedRateSwap.deposit(ether('0'), ether('1'), { from: wallet1 });
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

        it('should not be allowed for others', async function () {
            await expectRevert(
                this.fixedRateSwap.deposit(ether('1'), ether('1'), { from: wallet2 }),
                'Ownable: caller is not the owner',
            );
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
