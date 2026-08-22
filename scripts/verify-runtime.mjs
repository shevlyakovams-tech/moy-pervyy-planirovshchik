import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  ".next/standalone/server.js",
  ".next/standalone/.next/static",
  ".next/standalone/public/tray-icon.svg",
  ".next/standalone/node_modules/.prisma/client",
  ".next/standalone/node_modules/@prisma/client",
  "dist-electron/main.cjs"
];
const missing = required.filter((item) => !fs.existsSync(path.join(root, item)));
if (missing.length) {
  console.error(`Runtime artifacts missing: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`Runtime artifacts verified (${required.length}).`);
