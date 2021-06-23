const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const FixedFeeSwap = artifacts.require('FixedFeeSwap');
const TokenMock = artifacts.require('TokenMock');

contract('FixedFeeSwap', function ([_, wallet1, wallet2]) {
    beforeEach(async function () {
        this.USDT = await TokenMock.new('USDT', 'USDT');
        this.USDC = await TokenMock.new('USDC', 'USDC');
        this.fixedFeeSwap = await FixedFeeSwap.new(this.USDT.address, this.USDC.address, ether('0.0003'), 'FixedFeeSwap', 'FFS', 18);
        await this.fixedFeeSwap.transferOwnership(wallet1);
        await this.USDT.mint(wallet1, ether('10'));
        await this.USDT.mint(wallet2, ether('10'));
        await this.USDC.mint(wallet1, ether('10'));
        await this.USDC.mint(wallet2, ether('10'));
        await this.USDT.approve(this.fixedFeeSwap.address, ether('10'), { from: wallet1 });
        await this.USDC.approve(this.fixedFeeSwap.address, ether('10'), { from: wallet1 });
        await this.USDT.approve(this.fixedFeeSwap.address, ether('10'), { from: wallet2 });
        await this.USDC.approve(this.fixedFeeSwap.address, ether('10'), { from: wallet2 });
    });

    describe('Deposits', async function () {
        it('should be denied for zero amount', async function () {
            await expectRevert(
                this.fixedFeeSwap.deposit(ether('0'), ether('0'), { from: wallet1 }),
                'Empty deposit is not allowed',
            );
        });

        it('should be allowed for owner', async function () {
            await this.fixedFeeSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
            expect(await this.fixedFeeSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('2'));
        });

        it('should not be allowed for others', async function () {
            await expectRevert(
                this.fixedFeeSwap.deposit(ether('1'), ether('1'), { from: wallet2 }),
                'Ownable: caller is not the owner',
            );
        });

        it('should give the same shares for the same deposits', async function () {
            await this.fixedFeeSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
            expect(await this.fixedFeeSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('2'));
            await this.fixedFeeSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
            expect(await this.fixedFeeSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('4'));
        });
    });

    describe('Withdrawals', async function () {
        beforeEach(async function () {
            await this.fixedFeeSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
        });

        it('should be able to exit fully', async function () {
            await this.fixedFeeSwap.withdraw(ether('2'), { from: wallet1 });
            expect(await this.fixedFeeSwap.balanceOf(wallet1)).to.be.bignumber.equal('0');
            expect(await this.USDT.balanceOf(this.fixedFeeSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDC.balanceOf(this.fixedFeeSwap.address)).to.be.bignumber.equal('0');
            expect(await this.USDT.balanceOf(wallet1)).to.be.bignumber.equal(ether('10'));
            expect(await this.USDC.balanceOf(wallet1)).to.be.bignumber.equal(ether('10'));
        });

        it('should be able to exit partially', async function () {
            await this.fixedFeeSwap.withdraw(ether('1'), { from: wallet1 });
            expect(await this.fixedFeeSwap.balanceOf(wallet1)).to.be.bignumber.equal(ether('1'));
            expect(await this.USDT.balanceOf(this.fixedFeeSwap.address)).to.be.bignumber.equal(ether('0.5'));
            expect(await this.USDC.balanceOf(this.fixedFeeSwap.address)).to.be.bignumber.equal(ether('0.5'));
            expect(await this.USDT.balanceOf(wallet1)).to.be.bignumber.equal(ether('9.5'));
            expect(await this.USDC.balanceOf(wallet1)).to.be.bignumber.equal(ether('9.5'));
        });
    });

    describe('Swaps', async function () {
        beforeEach(async function () {
            await this.fixedFeeSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
        });

        it('should swap directly', async function () {
            await this.fixedFeeSwap.swap(ether('1'), { from: wallet2 });
            expect(await this.USDT.balanceOf(wallet2)).to.bignumber.equal(ether('9'));
            expect(await this.USDC.balanceOf(wallet2)).to.bignumber.equal(ether('10.9997'));
        });

        it('should swap inversly', async function () {
            await this.fixedFeeSwap.swap(ether('1').setn(255, true), { from: wallet2 });
            expect(await this.USDC.balanceOf(wallet2)).to.bignumber.equal(ether('9'));
            expect(await this.USDT.balanceOf(wallet2)).to.bignumber.equal(ether('10.9997'));
        });
    });

    it('should withdraw all after swap', async function () {
        await this.fixedFeeSwap.deposit(ether('1'), ether('1'), { from: wallet1 });
        await this.fixedFeeSwap.swap(ether('1'), { from: wallet2 });
        await this.fixedFeeSwap.withdraw(ether('2'), { from: wallet1 });
        expect(await this.USDT.balanceOf(wallet1)).to.be.bignumber.equal(ether('11'));
        expect(await this.USDC.balanceOf(wallet1)).to.be.bignumber.equal(ether('9.0003'));
    });
});
