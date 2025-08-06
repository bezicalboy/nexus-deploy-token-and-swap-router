import { ethers } from 'ethers';
import { config } from 'dotenv';
import solc from 'solc';

config();

// Realistic crypto name generators
const CRYPTO_NAME_PARTS = {
  prefixes: ['Meta', 'Crypto', 'Quantum', 'Neon', 'Hyper', 'Omni', 'Poly', 'X', 'Zero', 'Infinite'],
  cores: ['Chain', 'Ledger', 'Vault', 'Node', 'Protocol', 'Net', 'Web', 'Bit', 'Byte', 'Hash'],
  suffixes: ['Coin', 'Token', 'Pay', 'Cash', 'Dex', 'Swap', 'Fi', 'Nomics', 'X', 'Dao']
};

const NFT_NAME_PARTS = {
  prefixes: ['Cyber', 'Digital', 'Virtual', 'Meta', 'Crypto', 'NFT', 'Pixel', 'Block', 'DeFi', 'Web3'],
  cores: ['Punk', 'Ape', 'Doge', 'Frog', 'Alien', 'Wizard', 'Dragon', 'Samurai', 'Kong', 'Ghost'],
  suffixes: ['Collectible', 'Art', 'Item', 'Gem', 'Treasure', 'Relic', 'Legend', 'Memorabilia', 'Token', 'Pass']
};

// In-memory Solidity contracts
const CONTRACTS = {
  'MyToken.sol': `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MyToken {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    
    constructor(string memory _name, string memory _symbol, uint256 _initialSupply) {
        name = _name;
        symbol = _symbol;
        _mint(msg.sender, _initialSupply);
    }
    
    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        balanceOf[to] += value;
    }
    
    function transfer(address to, uint256 value) public returns (bool) {
        require(balanceOf[msg.sender] >= value, "Insufficient balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        return true;
    }
}`,
  'MyNFT.sol': `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MyNFT {
    string public name;
    string public symbol;
    uint256 public nextTokenId = 1;
    mapping(uint256 => address) private _owners;
    
    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }
    
    function safeMint(address to) public returns (uint256) {
        uint256 tokenId = nextTokenId++;
        _owners[tokenId] = to;
        return tokenId;
    }
    
    function ownerOf(uint256 tokenId) public view returns (address) {
        require(_owners[tokenId] != address(0), "Token doesn't exist");
        return _owners[tokenId];
    }
    
    function totalSupply() public view returns (uint256) {
        return nextTokenId - 1;
    }
}`
};

// Generate realistic crypto names
function generateCryptoName(type: 'token' | 'nft'): { name: string, symbol: string } {
  const parts = type === 'token' ? CRYPTO_NAME_PARTS : NFT_NAME_PARTS;
  const prefix = parts.prefixes[Math.floor(Math.random() * parts.prefixes.length)];
  const core = parts.cores[Math.floor(Math.random() * parts.cores.length)];
  const suffix = parts.suffixes[Math.floor(Math.random() * parts.suffixes.length)];
  
  // 50% chance to use 2-part name
  const name = Math.random() > 0.5 
    ? `${prefix} ${core} ${suffix}` 
    : `${prefix} ${suffix}`;
    
  // Generate symbol (3-5 chars)
  const symbolParts = [prefix, core, suffix]
    .filter(p => p.length > 0)
    .map(p => p[0].toUpperCase());
    
  const symbol = symbolParts.length > 3 
    ? `${symbolParts[0]}${symbolParts[1]}${symbolParts[2]}`
    : symbolParts.join('');

  return { name, symbol };
}

// Compile contract function
function compileContract(contractName: keyof typeof CONTRACTS) {
  const input = {
    language: 'Solidity',
    sources: {
      [contractName]: {
        content: CONTRACTS[contractName]
      }
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object']
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  if (output.errors) {
    output.errors.forEach((err: any) => console.error(err.formattedMessage));
    throw new Error('Compilation failed');
  }

  const contract = output.contracts[contractName][contractName.replace('.sol', '')];
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object
  };
}

// Main deployment function
async function deploy() {
  try {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("Missing PRIVATE_KEY in .env");
    
    const rpc =  process.env.RPC_URL; // Or load from rpc.txt
    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log(`Deployer: ${wallet.address}`);
    console.log(`Balance: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH`);

    // Deploy Token
    const tokenArtifact = compileContract('MyToken.sol');
    const { name: tokenName, symbol: tokenSymbol } = generateCryptoName('token');
    const initialSupply = ethers.parseUnits("1000000", 18);
    
    console.log(`\nDeploying Token: ${tokenName} (${tokenSymbol})...`);
    const tokenFactory = new ethers.ContractFactory(
      tokenArtifact.abi,
      tokenArtifact.bytecode,
      wallet
    );
    const token = await tokenFactory.deploy(tokenName, tokenSymbol, initialSupply);
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    console.log(`✅ Token deployed to: ${tokenAddress}`);
    console.log(`   Initial supply: ${ethers.formatUnits(initialSupply, 18)} ${tokenSymbol}`);

    // Deploy NFT
    const nftArtifact = compileContract('MyNFT.sol');
    const { name: nftName, symbol: nftSymbol } = generateCryptoName('nft');
    
    console.log(`\nDeploying NFT: ${nftName} (${nftSymbol})...`);
    const nftFactory = new ethers.ContractFactory(
      nftArtifact.abi,
      nftArtifact.bytecode,
      wallet
    );
    const nft = await nftFactory.deploy(nftName, nftSymbol);
    await nft.waitForDeployment();
    const nftAddress = await nft.getAddress();
    console.log(`✅ NFT deployed to: ${nftAddress}`);

    // Mint NFTs
    console.log("\nMinting NFTs...");
    const mintTx1 = await nft.safeMint(wallet.address);
    await mintTx1.wait();
    const mintTx2 = await nft.safeMint(wallet.address);
    await mintTx2.wait();
    console.log(`✅ Minted 2 NFTs to ${wallet.address}`);
    console.log(`   Total supply: ${await nft.totalSupply()}`);

    // Distribute Tokens
    console.log("\nDistributing tokens...");
    const sendTx = await token.transfer("0x000000000000000000000000000000000000dEaD", ethers.parseUnits("1000", 18));
    await sendTx.wait();
    console.log(`✅ Sent 1000 ${tokenSymbol} to burn address`);

    console.log("\n🎉 Deployment Summary:");
    console.log(`Token: ${tokenName} (${tokenSymbol})`);
    console.log(`  Address: ${tokenAddress}`);
    console.log(`  Supply: ${ethers.formatUnits(initialSupply, 18)}`);
    console.log(`\nNFT: ${nftName} (${nftSymbol})`);
    console.log(`  Address: ${nftAddress}`);
    console.log(`  Minted: 2 tokens`);

  } catch (error) {
    console.error("\n❌ Deployment failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run deployment
deploy();
