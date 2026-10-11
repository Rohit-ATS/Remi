// Deploys RemiPayouts.
//
//   NETWORK=testnet npm run deploy    deploys DemoUSD, then RemiPayouts over it
//   NETWORK=mainnet npm run deploy    requires TOKEN_ADDRESS (real AUSD)
//
// Monad charges the declared gas limit rather than the gas used, so every write
// in this repo passes an explicit `gas`. The script prints used-against-declared
// so the limits in the app can be tightened against real numbers.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, http, formatEther, parseUnits } from "viem";
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

const monad = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadExplorer", url: "https://explorer.monad.xyz" } },
});

const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadExplorer", url: "https://testnet.monadexplorer.com" } },
  testnet: true,
});


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

const network =
  process.env.NETWORK === "mainnet"
    ? "mainnet"
    : process.env.NETWORK === "local"
      ? "local"
      : "testnet";
const chain = network === "mainnet" ? monad : network === "local" ? localChain : monadTestnet;
const rpcUrl = process.env.RPC_URL ?? chain.rpcUrls.default.http[0];

const privateKey = network === "local" ? (process.env.PRIVATE_KEY ?? LOCAL_KEY) : process.env.PRIVATE_KEY;
if (!privateKey) {
  console.error("PRIVATE_KEY is not set. Copy .env.example to .env and add a deploy key.");
  console.error("Use a key that holds nothing but gas.");
  process.exit(1);
}

const GAS = { deployToken: 700_000n, deployPayouts: 1_600_000n, mint: 80_000n };

function artifact(name) {
  const path = join(root, "artifacts", `${name}.json`);
  if (!existsSync(path)) {
    console.error(`artifacts/${name}.json is missing. Run \`npm run compile\` first.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

console.log(`network   ${network} (chain ${chain.id})`);
console.log(`rpc       ${rpcUrl}`);
console.log(`deployer  ${account.address}`);

const balance = await publicClient.getBalance({ address: account.address });
console.log(`balance   ${formatEther(balance)} MON`);
if (balance === 0n) {
  console.error("\nThe deployer has no MON. Fund it before deploying.");
  process.exit(1);
}

async function deploy(name, args, gas) {
  const { abi, bytecode } = artifact(name);
  const hash = await wallet.deployContract({ abi, bytecode, args, gas });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    console.error(`${name} deployment reverted (${hash})`);
    process.exit(1);
  }
  const pct = ((Number(receipt.gasUsed) / Number(gas)) * 100).toFixed(0);
  console.log(
    `\n${name}\n  address  ${receipt.contractAddress}\n  tx       ${hash}\n  gas      ${receipt.gasUsed} used of ${gas} declared (${pct}%)`,
  );
  return { address: receipt.contractAddress, blockNumber: receipt.blockNumber };
}

let tokenAddress;

if (network === "mainnet") {
  tokenAddress = process.env.TOKEN_ADDRESS;
  if (!tokenAddress || !/^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) {
    console.error(
      "\nTOKEN_ADDRESS must be set to AUSD's address on Monad mainnet before deploying there.",
    );
    console.error("Take it from Agora's own documentation or the Monad explorer. Do not guess it.");
    process.exit(1);
  }

  // Reading decimals() before writing the address anywhere catches the wrong
  // token, and an 18-decimal token would silently misprice every payout by 10^12.
  const decimals = await publicClient.readContract({
    address: tokenAddress,
    abi: [{ type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" }],
    functionName: "decimals",
  });
  console.log(`token     ${tokenAddress} reports ${decimals} decimals`);
  if (Number(decimals) !== 6) {
    console.error(`\nExpected a 6-decimal token. ${tokenAddress} reports ${decimals}.`);
    process.exit(1);
  }
} else {
  const token = await deploy("DemoUSD", [], GAS.deployToken);
  tokenAddress = token.address;

  const { abi } = artifact("DemoUSD");
  const amount = parseUnits("50000", 6);
  const hash = await wallet.writeContract({
    address: tokenAddress,
    abi,
    functionName: "mint",
    args: [account.address, amount],
    gas: GAS.mint,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  minted   50,000 dUSD to the deployer`);
}

const payouts = await deploy("RemiPayouts", [tokenAddress], GAS.deployPayouts);

// A local chain has no explorer, so there is nothing to link to.
const explorer = chain.blockExplorers?.default.url ?? null;
if (explorer !== null) console.log(`\nexplorer  ${explorer}/address/${payouts.address}`);

const envPath = join(root, ".env");
const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const updates = {
  NETWORK: network,
  PAYOUTS_ADDRESS: payouts.address,
  TOKEN_ADDRESS: tokenAddress,
  START_BLOCK: payouts.blockNumber.toString(),
};

let next = existing;
for (const [key, value] of Object.entries(updates)) {
  const line = `${key}=${value}`;
  next = new RegExp(`^${key}=.*$`, "m").test(next)
    ? next.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : `${next.endsWith("\n") || next === "" ? next : `${next}\n`}${line}\n`;
}
writeFileSync(envPath, next);

console.log(`\nwrote .env:`);
for (const [k, v] of Object.entries(updates)) console.log(`  ${k}=${v}`);
console.log(`\nStart the server and app with: npm run dev`);
