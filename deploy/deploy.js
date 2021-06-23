const { ether } = require('@openzeppelin/test-helpers');
const { getChainId } = require('hardhat');

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // mainnet
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // mainnet

module.exports = async ({ deployments, getNamedAccounts }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const args = [USDC, USDT, ether('0.0003').toString(), 'FixedFeeSwap', 'FFS', 6];
    const FixedFeeSwap = await deploy('FixedFeeSwap', {
        args: args,
        from: deployer,
    });

    console.log('FixedFeeSwap deployed to:', FixedFeeSwap.address);

    if (await getChainId() != 31337) {
        await hre.run('verify:verify', {
            address: FixedFeeSwap.address,
            constructorArguments: args,
        });
    }
};

module.exports.skip = async () => true;
