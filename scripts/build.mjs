import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
process.env.NEXT_TELEMETRY_DISABLED = "1";

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false, env: process.env, windowsHide: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "build"]);
run(process.execPath, [path.join(root, "node_modules", "esbuild", "bin", "esbuild"),
  path.join(root, "src", "electron", "main.ts"), "--bundle", "--platform=node", "--format=cjs", "--external:electron", `--outfile=${path.join(root, "dist-electron", "main.cjs")}`
]);

const standalone = path.join(root, ".next", "standalone");
const copy = (source, destination) => {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
};
copy(path.join(root, "public"), path.join(standalone, "public"));
copy(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
copy(path.join(root, "node_modules", ".prisma"), path.join(standalone, "node_modules", ".prisma"));
copy(path.join(root, "node_modules", "@prisma", "client"), path.join(standalone, "node_modules", "@prisma", "client"));

run(process.execPath, ["scripts/verify-runtime.mjs"]);
