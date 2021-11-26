const hre = require('hardhat');
const { getChainId } = hre;

const USDC_BSC = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';

module.exports = async ({ deployments, getNamedAccounts }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const args = [USDC_BSC, USDT_BSC, 'FixedRateSwap', 'FRS', 18];
    const FixedRateSwap = await deploy('FixedRateSwap', {
        args: args,
        from: deployer,
        skipIfAlreadyDeployed: true,
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
