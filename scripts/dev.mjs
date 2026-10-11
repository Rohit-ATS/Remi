// Runs the server and the app together.
//
// `npm run dev --workspaces` runs workspaces serially, so the server would
// block and the app would never start. This spawns both, prefixes their output,
// and takes the whole group down if either one exits.
//
// Two things make that harder than it sounds. `node --watch` does not exit when
// the entry point throws — it prints the stack and waits for a file change — so
// a server that never binds looks exactly like a healthy one unless we check
// the port ourselves. And npm spawns the real process as a child of its own, so
// killing the child we spawned would leave that grandchild holding the port,
// which is what makes the *next* `npm run dev` fail. Each target therefore gets
// its own process group, and we signal the group.

import { spawn, spawnSync } from "node:child_process";
import { connect, createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Vite listens on ::1 only, while Fastify listens on 127.0.0.1, so a probe
// has to try both families or it reports a healthy service as missing.
const targets = [
  {
    name: "server",
    colour: "\u001b[36m",
    url: "http://127.0.0.1:8787",
    port: 8787,
    hosts: ["127.0.0.1"],
  },
  {
    name: "app",
    colour: "\u001b[35m",
    url: "http://localhost:5173",
    port: 5173,
    hosts: ["127.0.0.1", "::1"],
  },
];

// Windows needs different handling at both ends. `npm` there is npm.cmd, and
// since Node's CVE-2024-27980 fix a .cmd cannot be spawned without a shell —
// it throws EINVAL. Windows also has no process groups for process.kill(-pid),
// so the tree is taken down with taskkill instead. Without both, `npm run dev`
// fails on Windows before either service starts.
const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";

const RESET = "\u001b[0m";
const DIM = "\u001b[2m";
const RED = "\u001b[31m";

// How long a target gets to bind its port before we say something is wrong.
const READY_TIMEOUT_MS = 30_000;

const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode !== null || child.pid === undefined) continue;
    if (isWindows) {
      // /T takes the whole tree, which is what npm's grandchild needs.
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      continue;
    }
    // Negative pid signals the whole group, so npm's own child goes too.
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
  process.exit(code);
}

function hostPortIsFree(host, port) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once("error", () => done(false));
    probe.once("listening", () => probe.close(() => done(true)));
    probe.listen(port, host);
  });
}

// Busy on any family means we cannot have the port to ourselves.
async function portIsFree(hosts, port) {
  for (const host of hosts) {
    if (!(await hostPortIsFree(host, port))) return false;
  }
  return true;
}

function hostPortIsListening(host, port) {
  return new Promise((done) => {
    const socket = connect({ host, port });
    const settle = (answer) => {
      socket.destroy();
      done(answer);
    };
    socket.setTimeout(500);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

// Answering on any family means the service is up.
async function portIsListening(hosts, port) {
  for (const host of hosts) {
    if (await hostPortIsListening(host, port)) return true;
  }
  return false;
}

async function waitForPort(hosts, port) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline && !shuttingDown) {
    if (await portIsListening(hosts, port)) return true;
    await new Promise((tick) => setTimeout(tick, 250));
  }
  return false;
}

// A port left busy by an earlier run is the most common reason dev appears to
// start and then does nothing useful, so say so plainly instead of letting the
// two services half-start.
const busy = [];
for (const { name, hosts, port } of targets) {
  if (!(await portIsFree(hosts, port))) busy.push({ name, port });
}

if (busy.length > 0) {
  process.stderr.write(`\n${RED}remi dev cannot start${RESET}\n`);
  for (const { name, port } of busy) {
    process.stderr.write(`  port ${port} is already in use (${name})\n`);
  }
  process.stderr.write(
    `\nAn earlier \`npm run dev\` may still be running. Find it with\n` +
      `  lsof -nP -iTCP -sTCP:LISTEN | grep -E '${targets.map((t) => t.port).join("|")}'\n` +
      `and stop it, then try again.\n\n`,
  );
  process.exit(1);
}

for (const { name, colour } of targets) {
  const child = spawn(npmCommand, ["run", "dev", "--workspace", name], {
    cwd: root,
    // A process group is what lets us take npm's own child down with it; on
    // Windows taskkill /T does that job instead.
    detached: !isWindows,
    shell: isWindows,
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

  child.on("error", (error) => {
    process.stderr.write(`${prefix}${RED}could not start: ${error.message}${RESET}\n`);
    shutdown(1);
  });

  child.on("exit", (code) => {
    process.stdout.write(`${prefix}exited with ${code ?? 0}\n`);
    shutdown(code ?? 0);
  });

  children.push(child);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

process.stdout.write(`\n${DIM}remi dev — starting${RESET}\n`);

for (const { name, colour, url, hosts, port } of targets) {
  const prefix = `${colour}${name.padEnd(6)}${RESET} │ `;
  if (await waitForPort(hosts, port)) {
    process.stdout.write(`${prefix}listening on ${url}\n`);
  } else if (!shuttingDown) {
    // `node --watch` keeps running after a failed start, so nothing above would
    // have told us. Point at the output, which has the real stack trace.
    process.stderr.write(
      `${prefix}${RED}did not bind port ${port} within ${READY_TIMEOUT_MS / 1000}s${RESET}\n` +
        `${prefix}see the ${name} output above for the error\n`,
    );
  }
}
