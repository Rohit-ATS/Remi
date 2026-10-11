// Local-chain faucet.
//
// A passkey account is brand new every time someone signs in on a fresh
// machine: no gas, no balance. On a local chain that would make the product
// untestable without hand-running a script, so the server can top one up.
//
// This exists ONLY when NETWORK=local. `loadConfig` refuses to populate
// devMintKey on any other network, and the route checks again before signing,
// so there is no configuration that turns this into a mainnet mint.

import { createWalletClient, createPublicClient, http, parseEther, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Config } from "./config.ts";
import { demoUSDAbi } from "./generated/abi.ts";

export type FaucetResult = {
  address: string;
  gasTopUp: string;
  minted: string;
  txs: string[];
};

const GAS_TARGET = parseEther("1");
const MINT_AMOUNT = parseUnits("5000", 6);

export async function fund(config: Config, address: `0x${string}`): Promise<FaucetResult> {
  if (config.network !== "local") {
    throw new Error("The faucet only runs against a local chain.");
  }
  if (config.devMintKey === null) {
    throw new Error("PRIVATE_KEY is not set, so there is no account to fund from.");
  }
  if (config.tokenAddress === null) {
    throw new Error("TOKEN_ADDRESS is not set. Run `npm run deploy` first.");
  }

  const key = config.devMintKey.startsWith("0x") ? config.devMintKey : `0x${config.devMintKey}`;
  const account = privateKeyToAccount(key as `0x${string}`);
  const publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
  const wallet = createWalletClient({ account, chain: config.chain, transport: http(config.rpcUrl) });

  const txs: string[] = [];

  // Gas first: a token balance is useless to an account that cannot pay to move it.
  const balance = await publicClient.getBalance({ address });
  let gasTopUp = 0n;
  if (balance < GAS_TARGET) {
    gasTopUp = GAS_TARGET - balance;
    const hash = await wallet.sendTransaction({ to: address, value: gasTopUp });
    await publicClient.waitForTransactionReceipt({ hash });
    txs.push(hash);
  }

  const hash = await wallet.writeContract({
    address: config.tokenAddress,
    abi: demoUSDAbi,
    functionName: "mint",
    args: [address, MINT_AMOUNT],
    gas: 80_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  txs.push(hash);

  return {
    address,
    gasTopUp: gasTopUp.toString(),
    minted: MINT_AMOUNT.toString(),
    txs,
  };
}
