// deployAndSwap.js
import { ethers } from 'ethers';
import { config } from 'dotenv';
import solc from 'solc';

// Load environment variables from .env file
config();

// --- Configuration ---
const NEXUS_TESTNET_RPC = 'https://nexus.explorer.caldera.xyz';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// --- In-Memory Solidity Contracts ---
// All Solidity code is stored here as text. No separate .sol files are needed.
const CONTRACTS = {
  'TestERC20.sol': `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TestERC20 {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 _initialSupply) {
        name = _name;
        symbol = _symbol;
        _mint(msg.sender, _initialSupply * (10 ** uint256(decimals)));
    }

    function _mint(address to, uint256 amount) internal {
        require(to != address(0), "ERC20: mint to the zero address");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
    
    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public returns (bool) {
        uint256 currentAllowance = allowance[sender][msg.sender];
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        
        _transfer(sender, recipient, amount);
        allowance[sender][msg.sender] = currentAllowance - amount;
        return true;
    }
    
    function transfer(address recipient, uint256 amount) public returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "ERC20: transfer from zero address");
        require(recipient != address(0), "ERC20: transfer to zero address");
        
        uint256 senderBalance = balanceOf[sender];
        require(senderBalance >= amount, "ERC20: transfer amount exceeds balance");
        
        balanceOf[sender] = senderBalance - amount;
        balanceOf[recipient] += amount;
        
        emit Transfer(sender, recipient, amount);
    }
}`,
  'SimpleSwap.sol': `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract SimpleSwap {
    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;

    uint256 public reserveA;
    uint256 public reserveB;

    constructor(address _tokenA, address _tokenB) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }

    function addLiquidity(uint256 _amountA, uint256 _amountB) public {
        tokenA.transferFrom(msg.sender, address(this), _amountA);
        tokenB.transferFrom(msg.sender, address(this), _amountB);
        reserveA += _amountA;
        reserveB += _amountB;
    }

    function getAmountOut(uint256 _amountIn, address _tokenIn) public view returns (uint256) {
        require(_tokenIn == address(tokenA) || _tokenIn == address(tokenB), "Invalid token");
        (uint256 reserveIn, uint256 reserveOut) = (_tokenIn == address(tokenA)) ? (reserveA, reserveB) : (reserveB, reserveA);
        require(reserveIn > 0 && reserveOut > 0, "Not enough liquidity");
        uint256 amountInWithFee = _amountIn * 997 / 1000;
        return (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
    }

    function swap(uint256 _amountIn, address _tokenIn) public {
        require(_amountIn > 0, "Amount must be positive");
        uint256 amountOut = getAmountOut(_amountIn, _tokenIn);
        (IERC20 tokenIn, IERC20 tokenOut) = (_tokenIn == address(tokenA)) ? (tokenA, tokenB) : (tokenB, tokenA);

        tokenIn.transferFrom(msg.sender, address(this), _amountIn);
        tokenOut.transfer(msg.sender, amountOut);
        (reserveA, reserveB) = (tokenA.balanceOf(address(this)), tokenB.balanceOf(address(this)));
    }
}`
};

// --- Helper Functions ---
function compileContract(contractName, contractInstanceName) {
  const input = {
    language: 'Solidity',
    sources: { [contractName]: { content: CONTRACTS[contractName] } },
    settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    output.errors.forEach(err => console.error(err.formattedMessage));
    throw new Error('Compilation failed');
  }
  const contract = output.contracts[contractName][contractInstanceName];
  return { abi: contract.abi, bytecode: contract.evm.bytecode.object };
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Main Execution ---
async function main() {
  if (!PRIVATE_KEY) {
    console.error("❌ Missing PRIVATE_KEY in .env file. Aborting.");
    return;
  }

  console.log("🚀 Connecting to Nexus Testnet...");
  const provider = new ethers.JsonRpcProvider(NEXUS_TESTNET_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`✅ Connected! Wallet Address: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} NEX`);

  console.log("\n🔍 Compiling contracts from in-memory source...");
  const erc20Artifact = compileContract('TestERC20.sol', 'TestERC20');
  const swapArtifact = compileContract('SimpleSwap.sol', 'SimpleSwap');
  console.log("✅ Contracts compiled successfully.");

  console.log("\n🚀 Starting deployment...");
  const Erc20Factory = new ethers.ContractFactory(erc20Artifact.abi, erc20Artifact.bytecode, wallet);
  const SwapFactory = new ethers.ContractFactory(swapArtifact.abi, swapArtifact.bytecode, wallet);

  const tokenA = await Erc20Factory.deploy("tSWAP", "test swap", 100000);
  await tokenA.waitForDeployment();
  const tokenAAddress = await tokenA.getAddress();
  console.log(`- fUSDT Token deployed to: ${tokenAAddress}`);

  const tokenB = await Erc20Factory.deploy("noway", "ez contract lol", 10000);
  await tokenB.waitForDeployment();
  const tokenBAddress = await tokenB.getAddress();
  console.log(`- fWETH Token deployed to: ${tokenBAddress}`);
  
  const swapContract = await SwapFactory.deploy(tokenAAddress, tokenBAddress);
  await swapContract.waitForDeployment();
  const swapContractAddress = await swapContract.getAddress();
  console.log(`- SimpleSwap Contract deployed to: ${swapContractAddress}`);
  console.log("✅ All contracts deployed!");

  console.log("\n💧 Adding liquidity to the pool...");
  const liquidityAmountA = ethers.parseUnits("50000", 18);
  const liquidityAmountB = ethers.parseUnits("500", 18);

  console.log("- Approving fUSDT for liquidity...");
  let tx = await tokenA.approve(swapContractAddress, liquidityAmountA);
  await tx.wait();
  
  console.log("- Approving fWETH for liquidity...");
  tx = await tokenB.approve(swapContractAddress, liquidityAmountB);
  await tx.wait();

  console.log("- Calling addLiquidity function...");
  tx = await swapContract.addLiquidity(liquidityAmountA, liquidityAmountB);
  await tx.wait();
  console.log("✅ Liquidity added successfully!");

  console.log("\n🔁 Starting swap simulation (10 swaps)...");
  const amountToSwapEachTime = ethers.parseUnits("100", 18);
  const totalAmountToApprove = ethers.parseUnits("1000", 18);

  console.log("- Approving fUSDT for all 10 swaps...");
  tx = await tokenA.approve(swapContractAddress, totalAmountToApprove);
  await tx.wait();
  console.log("✅ Approval complete for all swaps.");

  for (let i = 1; i <= 10; i++) {
    console.log(`\n--- Swap #${i} ---`);
    try {
        const balanceBefore = await tokenB.balanceOf(wallet.address);
        console.log(`  Balance (fWETH) Before: ${ethers.formatUnits(balanceBefore, 18)}`);

        tx = await swapContract.swap(amountToSwapEachTime, tokenAAddress);
        const receipt = await tx.wait();
        console.log(`  Swap transaction successful! Hash: ${receipt.hash}`);

        const balanceAfter = await tokenB.balanceOf(wallet.address);
        console.log(`  Balance (fWETH) After:  ${ethers.formatUnits(balanceAfter, 18)}`);
        
        await sleep(500); 

    } catch (error) {
        console.error(`  ❌ Swap #${i} failed:`, error.reason || error.message);
        break;
    }
  }
  console.log("\n\n🏁 All tasks complete!");
}

main().catch((error) => {
  console.error("An unhandled error occurred:", error);
  process.exitCode = 1;
});
