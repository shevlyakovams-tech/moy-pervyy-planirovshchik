import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const database = path.resolve("tmp/e2e.db");
fs.mkdirSync(path.dirname(database), { recursive: true });
for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  const target = `${database}${suffix}`; if (fs.existsSync(target)) fs.rmSync(target);
}
fs.closeSync(fs.openSync(database, "a"));
const env = {
  ...process.env,
  DATABASE_URL: `file:${database.replaceAll("\\", "/")}`,
  HOSTNAME: "127.0.0.1",
  PORT: "3210",
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${JSON.stringify(path.resolve("scripts/patch-os-user-info.cjs"))}`].filter(Boolean).join(" ")
};
for (const [command, args] of [
  [process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"]],
  [process.execPath, ["--require", "./scripts/patch-os-user-info.cjs", "node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"]]
]) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit", windowsHide: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const server = spawn(process.execPath, [path.join(root, ".next", "standalone", "server.js")], { cwd: path.join(root, ".next", "standalone"), env, stdio: "inherit", windowsHide: true });
let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.kill();
  setTimeout(() => process.exit(0), 500);
});
server.on("exit", (code) => process.exit(code ?? 0));
