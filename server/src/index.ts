import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadConfig } from "./config.ts";
import { Store } from "./db.ts";
import { Indexer, makeClient } from "./indexer.ts";
import { registerRoutes } from "./routes.ts";

// A .env at the repo root is loaded by hand: one small function is clearer than
// a dependency, and it keeps the server importable from tests without side effects.
function loadDotEnv(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
loadDotEnv(join(repoRoot, ".env"));

const config = loadConfig();
const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  bodyLimit: 16 * 1024,
  trustProxy: config.trustProxy,
});

await app.register(cors, { origin: config.corsOrigins });

const store = new Store(config.dbPath);
const indexer = new Indexer(config, store, makeClient(config), (msg) => app.log.info(msg));

registerRoutes(app, config, store, indexer);

indexer.start();

const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`${signal} received, shutting down`);
  indexer.stop();
  await app.close();
  store.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.port, host: config.host });

app.log.info(
  `remi server on http://${config.host}:${config.port} · ${config.network} (chain ${config.chain.id})`,
);
if (config.payoutsAddress === null) {
  app.log.warn("PAYOUTS_ADDRESS is not set, so the indexer is idle. Run `npm run deploy` first.");
}
