// Pushes one real payout through RemiPayouts and prints the proof.
//
//   npm run verify-payment -- 0xRecipientAddress [amount]
//
// Prints the decoded PaymentSent event, both sides of the record the call
// wrote, and the wall-clock seconds from submit to confirmation. "Instant
// settlement" is the product claim, so it gets measured rather than asserted.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  formatUnits,
  http,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotEnv(join(root, ".env"));


const localChain = defineChain({
  id: 31337,
  name: "Localhost",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

// Hardhat's first account. Publicly known by design and worthless outside a
// local chain, so `npm run chain` needs no key setup at all.
const LOCAL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const chains = {
  local: localChain,
  mainnet: defineChain({
    id: 143,
    name: "Monad",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
    blockExplorers: { default: { name: "MonadExplorer", url: "https://explorer.monad.xyz" } },
  }),
  testnet: defineChain({
    id: 10143,
    name: "Monad Testnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
    blockExplorers: { default: { name: "MonadExplorer", url: "https://testnet.monadexplorer.com" } },
    testnet: true,
  }),
};

const GAS = { approve: 60_000n, payTo: 180_000n };

const recipient = process.argv[2];
const amountArg = process.argv[3] ?? "1";

if (!recipient || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
  console.error("usage: npm run verify-payment -- 0xRecipientAddress [amount]");
  process.exit(1);
}

const network =
  process.env.NETWORK === "mainnet"
    ? "mainnet"
    : process.env.NETWORK === "local"
      ? "local"
      : "testnet";
const chain = chains[network];
const rpcUrl = process.env.RPC_URL ?? chain.rpcUrls.default.http[0];

const { PAYOUTS_ADDRESS, TOKEN_ADDRESS } = process.env;
const PRIVATE_KEY = network === "local" ? (process.env.PRIVATE_KEY ?? LOCAL_KEY) : process.env.PRIVATE_KEY;
for (const [name, value] of Object.entries({ PRIVATE_KEY, PAYOUTS_ADDRESS, TOKEN_ADDRESS })) {
  if (!value) {
    console.error(`${name} is not set. Run \`npm run deploy\` first.`);
    process.exit(1);
  }
}

const payoutsAbi = JSON.parse(readFileSync(join(root, "artifacts", "RemiPayouts.json"), "utf8")).abi;
const erc20Abi = [
  { type: "function", name: "approve", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "allowance", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
];

const account = privateKeyToAccount(PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

const decimals = Number(
  await publicClient.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "decimals" }),
);
if (decimals !== 6) {
  console.error(`expected a 6-decimal token, ${TOKEN_ADDRESS} reports ${decimals}`);
  process.exit(1);
}
const amount = parseUnits(amountArg, decimals);

console.log(`network   ${network} (chain ${chain.id})`);
console.log(`payer     ${account.address}`);
console.log(`payee     ${recipient}`);
console.log(`amount    ${formatUnits(amount, decimals)}`);

const balance = await publicClient.readContract({
  address: TOKEN_ADDRESS,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address],
});
console.log(`balance   ${formatUnits(balance, decimals)}`);
if (balance < amount) {
  console.error(`\nThe payer holds ${formatUnits(balance, decimals)} and needs ${formatUnits(amount, decimals)}.`);
  process.exit(1);
}

const allowance = await publicClient.readContract({
  address: TOKEN_ADDRESS,
  abi: erc20Abi,
  functionName: "allowance",
  args: [account.address, PAYOUTS_ADDRESS],
});

if (allowance < amount) {
  console.log(`\napproving RemiPayouts to move the token…`);
  const hash = await wallet.writeContract({
    address: TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "approve",
    args: [PAYOUTS_ADDRESS, 2n ** 256n - 1n],
    gas: GAS.approve,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  ${receipt.status} · gas ${receipt.gasUsed} of ${GAS.approve} declared`);
}

console.log(`\nsending…`);
const startedAt = Date.now();

const hash = await wallet.writeContract({
  address: PAYOUTS_ADDRESS,
  abi: payoutsAbi,
  functionName: "payTo",
  args: [recipient, amount],
  gas: GAS.payTo,
});

const receipt = await publicClient.waitForTransactionReceipt({ hash });
const elapsedMs = Date.now() - startedAt;

if (receipt.status !== "success") {
  console.error(`\nreverted: ${hash}`);
  process.exit(1);
}

let decoded = null;
for (const log of receipt.logs) {
  try {
    const event = decodeEventLog({ abi: payoutsAbi, data: log.data, topics: log.topics });
    if (event.eventName === "PaymentSent") decoded = event.args;
  } catch {
    // Logs from the token contract are in this receipt too and do not decode
    // against the payouts ABI. Skipping them is expected.
  }
}

console.log(`\nPaymentSent`);
if (decoded) {
  console.log(`  receiptNo  ${decoded.receiptNo}`);
  console.log(`  payer      ${decoded.payer}`);
  console.log(`  payee      ${decoded.payee}`);
  console.log(`  amount     ${formatUnits(decoded.amount, decimals)}`);
  console.log(`  passport   ${decoded.passportEligible ? "attested" : "not attested"}`);
  console.log(`  timestamp  ${new Date(Number(decoded.timestamp) * 1000).toISOString()}`);
} else {
  console.log("  the event did not decode, which should not happen on a successful payout");
}

const passport = await publicClient.readContract({
  address: PAYOUTS_ADDRESS,
  abi: payoutsAbi,
  functionName: "passportOf",
  args: [recipient],
});

console.log(`\nthe payee's record after this payout`);
console.log(`  totalReceived  ${formatUnits(passport[0], decimals)}`);
console.log(`  payoutCount    ${passport[1]}`);
console.log(`  clientCount    ${passport[2]}`);
console.log(`  firstPaidAt    ${new Date(Number(passport[3]) * 1000).toISOString()}`);
console.log(`  lastPaidAt     ${new Date(Number(passport[4]) * 1000).toISOString()}`);

console.log(`\ngas        ${receipt.gasUsed} used of ${GAS.payTo} declared`);
console.log(`settled    ${(elapsedMs / 1000).toFixed(2)}s wall clock, submit to confirmation`);
const explorerUrl = chain.blockExplorers?.default.url ?? null;
console.log(explorerUrl === null ? `tx         ${hash}` : `tx         ${explorerUrl}/tx/${hash}`);
