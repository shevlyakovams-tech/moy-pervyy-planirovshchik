import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = process.cwd();
const profile = process.env.UTRENNIY_TEST_PROFILE ? path.resolve(process.env.UTRENNIY_TEST_PROFILE) : path.join(root, "tmp", "final-setup-profile");
const electron = path.join(root, "node_modules", "electron", "dist", "electron.exe");
const main = path.join(root, "dist-electron", "main.cjs");
if (!fs.existsSync(electron) || !fs.existsSync(main) || !fs.existsSync(path.join(root, "build-manifest.json"))) throw new Error("Electron test prerequisites missing");

const env = { ...process.env, APP_DATA_ROOT: profile, UTRENNIY_NODE_PATH: process.execPath, NEXT_TELEMETRY_DISABLED: "1" };
const launch = (exitAfter) => spawn(electron, [main, "--autostart", `--test-exit-after-health=${exitAfter}`], { cwd: root, env, windowsHide: true, stdio: "ignore" });
const waitForExit = (child, timeout) => Promise.race([
  new Promise((resolve) => child.once("exit", (code) => resolve(code))),
  new Promise((_, reject) => setTimeout(() => reject(new Error("Electron exit timeout")), timeout))
]);
async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try { const response = await fetch("http://127.0.0.1:3210/api/health"); if (response.ok) return; } catch { /* starting */ }
  }
  throw new Error("Electron health timeout");
}

const first = launch(5000);
await waitForHealth();
const second = launch(1000);
const secondCode = await waitForExit(second, 3000);
if (secondCode !== 0) throw new Error(`Second instance exited with ${secondCode}`);
const firstCode = await waitForExit(first, 8000);
if (firstCode !== 0) throw new Error(`First instance exited with ${firstCode}`);

const foreign = http.createServer((_request, response) => response.end("foreign"));
await new Promise((resolve) => foreign.listen(3210, "127.0.0.1", resolve));
try {
  const blocked = launch(1000);
  const blockedCode = await waitForExit(blocked, 5000);
  if (blockedCode === 0) throw new Error("Foreign process on port 3210 was not rejected");
} finally { await new Promise((resolve) => foreign.close(resolve)); }

console.log("Electron lifecycle, single instance, fixed port, health and graceful exit verified.");
