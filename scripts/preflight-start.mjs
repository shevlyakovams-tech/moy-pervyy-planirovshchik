import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };

export function validateStart(root, localAppData, expectedVersion = packageJson.version, appDataRoot = undefined) {
  const manifestPath = path.join(root, "build-manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error("Сборка не настроена. Сначала запустите setup.bat.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.appVersion !== expectedVersion) throw new Error("Исходный код изменился после сборки. Снова запустите setup.bat.");
  if (!fs.existsSync(path.join(root, ".next", "standalone", "server.js")) || !fs.existsSync(path.join(root, "dist-electron", "main.cjs"))) {
    throw new Error("Production-сборка неполна. Снова запустите setup.bat.");
  }
  const electronRuntime = [
    path.join(root, "node_modules", ".bin", "electron.cmd"),
    path.join(root, "node_modules", "electron", "cli.js"),
    path.join(root, "node_modules", "electron", "dist", "electron.exe")
  ];
  if (electronRuntime.some((target) => !fs.existsSync(target))) {
    throw new Error("Компонент запуска Electron установлен неполно. Снова запустите setup.bat.");
  }
  if (!appDataRoot && !localAppData) throw new Error("Windows не сообщил путь LOCALAPPDATA.");
  const database = appDataRoot ? path.join(path.resolve(appDataRoot), "data", "app.db") : path.join(localAppData, "UtrenniyRazvorot", "data", "app.db");
  if (!fs.existsSync(database)) throw new Error("Локальная база не найдена. Сначала запустите setup.bat.");
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url))) {
  try { validateStart(process.cwd(), process.env.LOCALAPPDATA, packageJson.version, process.env.APP_DATA_ROOT); }
  catch (error) { console.error(error instanceof Error ? error.message : "Проверка запуска не пройдена"); process.exit(1); }
}
