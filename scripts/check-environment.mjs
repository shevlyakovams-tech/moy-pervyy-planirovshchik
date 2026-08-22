import { spawnSync } from "node:child_process";

function numeric(version) { return version.replace(/^v/, "").split(".").map(Number); }
const [major, minor] = numeric(process.version);
if (!major || major < 22 || major >= 25 || (major === 22 && (minor ?? 0) < 12)) {
  console.error("Нужен Node.js LTS версии 22.12–24.x. Официальная загрузка: https://nodejs.org/");
  process.exit(1);
}
const npm = spawnSync("npm", ["--version"], { encoding: "utf8", shell: true, windowsHide: true });
if (npm.status !== 0) {
  console.error("npm не найден. Установите Node.js LTS с https://nodejs.org/");
  process.exit(1);
}
const npmMajor = Number(npm.stdout.trim().split(".")[0]);
if (npmMajor < 10 || npmMajor >= 12) {
  console.error("Нужен npm версии 10 или 11.");
  process.exit(1);
}
console.log(`Среда подходит: Node.js ${process.version}, npm ${npm.stdout.trim()}.`);
