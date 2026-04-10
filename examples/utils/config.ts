import { createPublicClient, createTestClient, createWalletClient, erc20Abi, getAddress, Hex, http, parseEther, parseUnits, PublicClient, TestClient, WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import dotenv from 'dotenv'
dotenv.config()

const PRIVATE_KEY = (process.env.PRIVATE_KEY ?? "0x1234567890123456789012345678901234567890123456789012345678901235") as Hex;
const PRIVATE_KEY2 = (process.env.PRIVATE_KEY2 ?? "0x1234567890123456789012345678901234567890123456789012345678901246") as Hex;

// Local Anvil RPC URL
const ANVIL_RPC_URL = "http://127.0.0.1:8545";
export const USDC_ADDRESS = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
export const EULER_PRIME_USDC_VAULT = getAddress("0x797DD80692c3b2dAdabCe8e30C07fDE5307D48a9");
export const USDT_ADDRESS = getAddress("0xdAC17F958D2ee523a2206206994597C13D831ec7");
export const WETH_ADDRESS = getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
export const EULER_PRIME_USDT_VAULT = getAddress("0x313603FA690301b0CaeEf8069c065862f9162162");
export const EULER_PRIME_WETH_VAULT = getAddress("0xD8b27CF359b7D15710a5BE299AF6e7Bf904984C2");


export const rpcUrls = {
  ...getRpcUrls(),
  [1]: ANVIL_RPC_URL, // Override with Anvil URL
};

export const account = privateKeyToAccount(PRIVATE_KEY);
export const account2 = privateKeyToAccount(PRIVATE_KEY2);

export const walletClient: WalletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(ANVIL_RPC_URL),
});

export const walletClient2: WalletClient = createWalletClient({
  account: account2,
  chain: mainnet,
  transport: http(ANVIL_RPC_URL),
});

export const publicClient: PublicClient = createPublicClient({
  chain: mainnet,
  transport: http(ANVIL_RPC_URL),
});

export const testClient: TestClient = createTestClient({
  chain: mainnet,
  mode: "anvil",
  transport: http(ANVIL_RPC_URL),
});

export async function initBalances() {
  const USDC_WHALE = "0xb7cD010b53D23a794d754886C3b928BE6a3315dC"
  const USDT_WHALE = "0x83A32a54D31Ee4f1f9dFFAd2A63A6d214e469eC3"
  const WETH_WHALE = "0x4a18a50a8328b42773268B4b436254056b7d70CE"

  if (!process.env.PRIVATE_KEY) {
    await testClient.setBalance({
      address: USDC_WHALE,
      value: parseEther('10'),
    });

    const wc = createWalletClient({
      account: USDC_WHALE,
      chain: mainnet,
      transport: http(ANVIL_RPC_URL),
    })

    await wc.writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [account.address, parseUnits('100000', 6)],
    })

    await wc.writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [account2.address, parseUnits('100000', 6)],
    })

    await createWalletClient({
      account: WETH_WHALE,
      chain: mainnet,
      transport: http(ANVIL_RPC_URL),
    }).writeContract({
      address: WETH_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [account.address, parseUnits('1000', 18)],
    })

    await createWalletClient({
      account: USDT_WHALE,
      chain: mainnet,
      transport: http(ANVIL_RPC_URL),
    }).writeContract({
      address: USDT_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [account.address, parseUnits('10000', 6)],
    })
  }

  await testClient.setBalance({
    address: account.address,
    value: parseEther('1000'),
  });

  await testClient.setBalance({
    address: account2.address,
    value: parseEther('1000'),
  });
}

/**
 * Reads RPC_URL_* environment variables and creates a mapping of chainId to RPC URL
 * Example: RPC_URL_1=https://mainnet.infura.io/... creates { 1: "https://mainnet.infura.io/..." }
 */
export function getRpcUrls(): Record<number, string> {
  const rpcUrls: Record<number, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("RPC_URL_")) {
      const chainIdStr = key.replace("RPC_URL_", "");
      const chainId = Number.parseInt(chainIdStr, 10);

      if (!Number.isNaN(chainId) && value) {
        rpcUrls[chainId] = value;
      }
    }
  }

  return rpcUrls;
}
