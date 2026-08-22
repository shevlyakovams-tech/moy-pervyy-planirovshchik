import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateStart } from "./preflight-start.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "utrenniy-preflight-"));
const local = path.join(root, "local");
try {
  for (const directory of [path.join(root, ".next", "standalone"), path.join(root, "dist-electron"), path.join(root, "node_modules", ".bin"), path.join(root, "node_modules", "electron", "dist"), path.join(local, "UtrenniyRazvorot", "data")]) fs.mkdirSync(directory, { recursive: true });
  const electronLauncher = path.join(root, "node_modules", ".bin", "electron.cmd");
  for (const file of [path.join(root, ".next", "standalone", "server.js"), path.join(root, "dist-electron", "main.cjs"), electronLauncher, path.join(root, "node_modules", "electron", "cli.js"), path.join(root, "node_modules", "electron", "dist", "electron.exe"), path.join(local, "UtrenniyRazvorot", "data", "app.db")]) fs.writeFileSync(file, "", "utf8");
  fs.writeFileSync(path.join(root, "build-manifest.json"), JSON.stringify({ appVersion: "0.0.9" }), "utf8");
  let mismatchRejected = false;
  try { validateStart(root, local, "0.1.0"); } catch (error) { mismatchRejected = error instanceof Error && error.message.includes("изменился"); }
  if (!mismatchRejected) throw new Error("Manifest mismatch was not rejected");
  fs.writeFileSync(path.join(root, "build-manifest.json"), JSON.stringify({ appVersion: "0.1.0" }), "utf8");
  validateStart(root, local, "0.1.0");
  fs.rmSync(electronLauncher);
  let missingElectronRejected = false;
  try { validateStart(root, local, "0.1.0"); } catch (error) { missingElectronRejected = error instanceof Error && error.message.includes("Electron"); }
  if (!missingElectronRejected) throw new Error("Missing Electron launcher was not rejected");
  console.log("Build mismatch and incomplete Electron are rejected; matching runtime passes preflight.");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
