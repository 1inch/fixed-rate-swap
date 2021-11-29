const hre = require('hardhat');
const { getChainId } = hre;

// mainnet
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const DECIMALS = 6;
// bsc
// const USDC = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
// const USDT = '0x55d398326f99059fF775485246999027B3197955';
// const DECIMALS = 18;
// matic
// const USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
// const USDT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
// const DECIMALS = 6;
// arbitrum
// const USDC = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8';
// const USDT = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
// const DECIMALS = 6;
// optimistic
// const USDC = '0x7F5c764cBc14f9669B88837ca1490cCa17c31607';
// const USDT = '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58';
// const DECIMALS = 6;

module.exports = async ({ deployments, getNamedAccounts }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const args = [USDC, USDT, 'FixedRateSwap', 'FRS', DECIMALS];
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
