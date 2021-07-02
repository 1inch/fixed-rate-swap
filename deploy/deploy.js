const hre = require('hardhat');
const { getChainId } = hre;

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // mainnet
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // mainnet

module.exports = async ({ deployments, getNamedAccounts }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const args = [USDC, USDT, 'FixedRateSwap', 'FRS', 6];
    const FixedRateSwap = await deploy('FixedRateSwap', {
        args: args,
        from: deployer,
    });

    console.log('FixedRateSwap deployed to:', FixedRateSwap.address);

    if (await getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: FixedRateSwap.address,
            constructorArguments: args,
        });
    }
};

module.exports.skip = async () => true;
