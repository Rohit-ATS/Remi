// Runs the server and the app together.
//
// `npm run dev --workspaces` runs workspaces serially, so the server would
// block and the app would never start. This spawns both, prefixes their output,
// and takes the whole group down if either one exits.

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const targets = [
  { name: "server", colour: "\u001b[36m" },
  { name: "app", colour: "\u001b[35m" },
];

const RESET = "\u001b[0m";
const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exit(code);
}

for (const { name, colour } of targets) {
  const child = spawn("npm", ["run", "dev", "--workspace", name], {
    cwd: root,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const prefix = `${colour}${name.padEnd(6)}${RESET} │ `;
  const forward = (stream, out) => {
    let buffer = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) out.write(`${prefix}${line}\n`);
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);

  child.on("exit", (code) => {
    process.stdout.write(`${prefix}exited with ${code ?? 0}\n`);
    shutdown(code ?? 0);
  });

  children.push(child);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

process.stdout.write(
  `\nremi dev\n  server  http://127.0.0.1:8787\n  app     http://localhost:5173\n\n`,
);
