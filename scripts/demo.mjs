// Fills a local chain with a plausible six months of payout history.
//
//   npm run demo                 history for the deployer account
//   npm run demo -- 0xYourAddr   history for a passkey account you signed in as
//
// These are real transactions producing real PaymentSent events that the
// indexer reads like any other. Nothing is written into the database directly,
// so what the dashboard shows is what the chain actually holds.
//
// Local chains only. Back-dating uses evm_setNextBlockTimestamp, which no real
// network exposes, and the whole point is to see six months of Books without
// waiting six months.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, http, parseUnits } from "viem";
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

if (process.env.NETWORK !== "local") {
  console.error("demo.mjs only runs against a local chain (NETWORK=local).");
  console.error("Start one with `npm run chain`, then `NETWORK=local npm run deploy`.");
  process.exit(1);
}

const LOCAL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const chain = defineChain({
  id: 31337,
  name: "Localhost",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

const { PAYOUTS_ADDRESS, TOKEN_ADDRESS } = process.env;
if (!PAYOUTS_ADDRESS || !TOKEN_ADDRESS) {
  console.error("PAYOUTS_ADDRESS / TOKEN_ADDRESS missing. Run `NETWORK=local npm run deploy`.");
  process.exit(1);
}

const payoutsAbi = JSON.parse(readFileSync(join(root, "artifacts", "RemiPayouts.json"), "utf8")).abi;
const tokenAbi = JSON.parse(readFileSync(join(root, "artifacts", "DemoUSD.json"), "utf8")).abi;

const rpcUrl = process.env.RPC_URL ?? chain.rpcUrls.default.http[0];
const deployer = privateKeyToAccount(process.env.PRIVATE_KEY ?? LOCAL_KEY);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const wallet = createWalletClient({ account: deployer, chain, transport: http(rpcUrl) });

// Who the history belongs to. Pass your passkey address to see it in the app.
const payerArg = process.argv[2];
const payer = payerArg ?? deployer.address;
if (payerArg !== undefined && !/^0x[0-9a-fA-F]{40}$/.test(payerArg)) {
  console.error("usage: npm run demo -- [0xPayerAddress]");
  process.exit(1);
}

const usd = (n) => parseUnits(String(n), 6);

const PAYEES = [
  { label: "maria", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", country: "PH" },
  { label: "ben", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", country: "MX" },
  { label: "ada", address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", country: "NG" },
];

// label, amount, category, memo, months back from today
const SCHEDULE = [
  ["maria", 950, "Contractor", "May retainer", 5],
  ["ben", 400, "Contractor", "Brand sprint", 5],
  ["maria", 950, "Contractor", "June retainer", 4],
  ["ada", 300, "Contractor", "Localisation", 4],
  ["maria", 950, "Contractor", "July retainer", 3],
  ["ben", 620, "Contractor", "Landing page", 3],
  ["maria", 950, "Contractor", "August retainer", 2],
  ["ada", 300, "Contractor", "Localisation", 2],
  ["maria", 975, "Contractor", "September retainer", 1],
  ["ben", 480, "Contractor", "Icon set", 1],
  ["maria", 400, "Contractor", "October, part one", 0],
  ["ada", 300, "Contractor", "Localisation", 0],
];

const OVERHEAD = [
  ["figma", 90, "Software", "Team seats", 0, "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"],
  ["studio", 2200, "Rent", "October rent", 0, "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"],
];

async function setNextTimestamp(unixSeconds) {
  await publicClient.request({
    method: "evm_setNextBlockTimestamp",
    params: [`0x${unixSeconds.toString(16)}`],
  });
}

function monthsAgo(months) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 12, 12, 0, 0));
  return Math.floor(d.getTime() / 1000);
}

async function send(tx) {
  const hash = await tx;
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`reverted: ${hash}`);
  return receipt;
}

console.log(`chain     local (31337)`);
console.log(`payer     ${payer}${payerArg ? "" : "  (deployer)"}`);

// When the history belongs to a passkey account, that account has to be able to
// sign its own payouts — so it needs gas and a balance of its own.
let signer = wallet;
if (payerArg !== undefined) {
  console.error(
    "\nA payer address cannot sign on its own here: only the local deployer key is available.",
  );
  console.error("Use the app's “Add test dollars” button and send payouts from the UI,");
  console.error("or run `npm run demo` with no argument to build history for the deployer.");
  process.exit(1);
}

console.log(`\nminting and approving…`);
await send(
  wallet.writeContract({
    address: TOKEN_ADDRESS,
    abi: tokenAbi,
    functionName: "mint",
    args: [payer, usd(100000)],
    gas: 80_000n,
  }),
);
await send(
  wallet.writeContract({
    address: TOKEN_ADDRESS,
    abi: tokenAbi,
    functionName: "approve",
    args: [PAYOUTS_ADDRESS, 2n ** 256n - 1n],
    gas: 60_000n,
  }),
);

console.log(`saving payees…`);
for (const payee of PAYEES) {
  await send(
    wallet.writeContract({
      address: PAYOUTS_ADDRESS,
      abi: payoutsAbi,
      functionName: "savePayee",
      args: [payee.label, payee.address, payee.country],
      gas: 180_000n,
    }),
  );
}

const byLabel = Object.fromEntries(PAYEES.map((p) => [p.label, p]));
let count = 0;

console.log(`\nsending payouts…`);
for (const [label, amount, category, memo, months] of SCHEDULE) {
  await setNextTimestamp(monthsAgo(months) + count * 60);
  await send(
    wallet.writeContract({
      address: PAYOUTS_ADDRESS,
      abi: payoutsAbi,
      functionName: "pay",
      args: [label, usd(amount), memo, category],
      gas: 260_000n,
    }),
  );
  count += 1;
  console.log(`  ${String(count).padStart(2)} ${label.padEnd(7)} $${String(amount).padStart(5)}  ${memo}`);
}

for (const [label, amount, category, memo, months, address] of OVERHEAD) {
  await setNextTimestamp(monthsAgo(months) + count * 60);
  await send(
    wallet.writeContract({
      address: PAYOUTS_ADDRESS,
      abi: payoutsAbi,
      functionName: "payTo",
      args: [address, usd(amount), label, memo, category],
      gas: 260_000n,
    }),
  );
  count += 1;
  console.log(`  ${String(count).padStart(2)} ${label.padEnd(7)} $${String(amount).padStart(5)}  ${memo} (${category})`);
}

console.log(`\n${count} payouts written across six months.`);
console.log(`Maria's Passport: /#/p/${PAYEES[0].address.toLowerCase()}`);
console.log(`\nStart the app with \`npm run dev\` and sign in to see them.`);
