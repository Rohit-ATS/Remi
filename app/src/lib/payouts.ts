// Contract operations.
//
// Reads go through a public client and never prompt. Writes each cost exactly
// one Face ID prompt, and every one declares an explicit gas limit because
// Monad charges the declared limit rather than the gas used — omitting it would
// quietly overcharge the payer on every payout.

import { createPublicClient, defineChain, http, type Address, type Chain, type PublicClient } from "viem";
import { remiPayoutsAbi, demoUSDAbi } from "../generated/abi.ts";
import { withSession } from "./account.ts";
import type { ServerConfig } from "./api.ts";

// Gas limits, tightened against the figures scripts/deploy.mjs prints.
export const GAS = {
  approve: 60_000n,
  pay: 180_000n,
} as const;

const MAX_UINT256 = 2n ** 256n - 1n;

/** The ERC20 surface Remi needs. AUSD and DemoUSD share it. */
const erc20Abi = demoUSDAbi;

export function chainFrom(config: ServerConfig): Chain {
  return defineChain({
    id: config.chainId,
    name:
      config.network === "mainnet"
        ? "Monad"
        : config.network === "local"
          ? "Localhost"
          : "Monad Testnet",
    nativeCurrency:
      config.network === "local"
        ? { name: "ETH", symbol: "ETH", decimals: 18 }
        : { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    ...(config.explorer
      ? { blockExplorers: { default: { name: "Explorer", url: config.explorer } } }
      : {}),
    ...(config.network === "mainnet" ? {} : { testnet: true }),
  });
}

export function publicClientFrom(config: ServerConfig): PublicClient {
  return createPublicClient({
    chain: chainFrom(config),
    transport: http(config.rpcUrl),
  }) as PublicClient;
}

function requireAddresses(config: ServerConfig): {
  payouts: Address;
  token: Address;
} {
  if (config.payoutsAddress === null || config.tokenAddress === null) {
    throw new Error("Remi is not pointed at a deployed contract yet. Run `npm run deploy`.");
  }
  return { payouts: config.payoutsAddress, token: config.tokenAddress };
}

// --- reads -----------------------------------------------------------------

export async function getBalance(config: ServerConfig, owner: Address): Promise<bigint> {
  const { token } = requireAddresses(config);
  return publicClientFrom(config).readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  }) as Promise<bigint>;
}

export async function getAllowance(config: ServerConfig, owner: Address): Promise<bigint> {
  const { token, payouts } = requireAddresses(config);
  return publicClientFrom(config).readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, payouts],
  }) as Promise<bigint>;
}

export type Passport = {
  totalReceived: bigint;
  payoutCount: number;
  clientCount: number;
  firstPaidAt: number;
  lastPaidAt: number;
};

/** Reads a payee's income record straight off the chain, with no index in between. */
export async function getPassport(config: ServerConfig, payee: Address): Promise<Passport> {
  const { payouts } = requireAddresses(config);
  const result = (await publicClientFrom(config).readContract({
    address: payouts,
    abi: remiPayoutsAbi,
    functionName: "passportOf",
    args: [payee],
  })) as readonly [bigint, bigint, bigint, bigint, bigint];

  return {
    totalReceived: result[0],
    payoutCount: Number(result[1]),
    clientCount: Number(result[2]),
    firstPaidAt: Number(result[3]),
    lastPaidAt: Number(result[4]),
  };
}

// --- writes ----------------------------------------------------------------

/** One-time approval so RemiPayouts can move the payer's AUSD. */
export async function enablePayouts(config: ServerConfig): Promise<`0x${string}`> {
  const { token, payouts } = requireAddresses(config);
  const chain = chainFrom(config);

  return withSession(chain, config.rpcUrl, async ({ client }) => {
    const hash = await client.writeContract({
      account: client.account!,
      chain,
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [payouts, MAX_UINT256],
      gas: GAS.approve,
    });
    await publicClientFrom(config).waitForTransactionReceipt({ hash });
    return hash;
  });
}

export type PreflightResult =
  | { ok: true }
  | { ok: false; kind: "needs-approval" }
  | { ok: false; kind: "insufficient-funds"; available: bigint }
  | { ok: false; kind: "bad-address" };

/**
 * Checks everything that could revert, before any Face ID prompt.
 *
 * A passkey prompt that leads to a revert is the worst failure in the product:
 * the user has already done the one thing the interface asked of them, and the
 * money still did not move.
 */
export async function preflight(
  config: ServerConfig,
  owner: Address,
  payeeAddress: string,
  amount: bigint,
): Promise<PreflightResult> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(payeeAddress)) return { ok: false, kind: "bad-address" };

  const [balance, allowance] = await Promise.all([
    getBalance(config, owner),
    getAllowance(config, owner),
  ]);

  if (balance < amount) return { ok: false, kind: "insufficient-funds", available: balance };
  if (allowance < amount) return { ok: false, kind: "needs-approval" };
  return { ok: true };
}

export type SentPayout = {
  hash: `0x${string}`;
  receiptNo: number | null;
  confirmedInMs: number;
};

/**
 * Sends a payout. One Face ID prompt.
 *
 * Payer metadata is kept in the encrypted client-side book. The contract gets
 * only the recipient and amount, because transaction calldata is public.
 */
export async function sendPayout(
  config: ServerConfig,
  options: {
    payeeAddress: Address;
    amount: bigint;
  },
): Promise<SentPayout> {
  const { payouts } = requireAddresses(config);
  const chain = chainFrom(config);
  const client = publicClientFrom(config);

  return withSession(chain, config.rpcUrl, async ({ client: wallet }) => {
    const startedAt = Date.now();

    const hash = await wallet.writeContract({
      account: wallet.account!,
      chain,
      address: payouts,
      abi: remiPayoutsAbi,
      functionName: "payTo",
      args: [options.payeeAddress, options.amount],
      gas: GAS.pay,
    });

    const receipt = await client.waitForTransactionReceipt({ hash });
    const confirmedInMs = Date.now() - startedAt;

    if (receipt.status !== "success") {
      throw new Error("That payout did not go through. Nothing left your account.");
    }

    // The receipt number comes from the PaymentSent topic rather than a second
    // read, so the receipt screen can render immediately.
    let receiptNo: number | null = null;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== payouts.toLowerCase()) continue;
      const topic = log.topics[1];
      if (topic !== undefined) {
        receiptNo = Number(BigInt(topic));
        break;
      }
    }

    return { hash, receiptNo, confirmedInMs };
  });
}
