import path from "node:path";

export type AppPaths = {
  root: string;
  data: string;
  database: string;
  logs: string;
  logFile: string;
  config: string;
};

export function getAppPaths(environment: NodeJS.ProcessEnv = process.env): AppPaths {
  const localAppData = environment.LOCALAPPDATA;
  const root = environment.APP_DATA_ROOT
    ? path.resolve(environment.APP_DATA_ROOT)
    : localAppData
      ? path.join(localAppData, "UtrenniyRazvorot")
      : path.join(process.cwd(), ".local-data", "UtrenniyRazvorot");

  return {
    root,
    data: path.join(root, "data"),
    database: path.join(root, "data", "app.db"),
    logs: path.join(root, "logs"),
    logFile: path.join(root, "logs", "app.log"),
    config: path.join(root, "config")
  };
}

export function databaseUrlFromPath(databasePath: string): string {
  return `file:${databasePath.replaceAll("\\", "/")}`;
}
