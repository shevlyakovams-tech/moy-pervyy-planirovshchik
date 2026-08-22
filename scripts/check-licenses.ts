import fs from "node:fs";
import path from "node:path";
import packageJson from "../package.json";

type PackageMetadata = { version?: string; license?: string | { type?: string }; repository?: string | { url?: string }; homepage?: string };
const direct = { ...packageJson.dependencies, ...packageJson.devDependencies };
const noticesPath = path.join(process.cwd(), "THIRD_PARTY_NOTICES.md");
if (!fs.existsSync(noticesPath)) throw new Error("THIRD_PARTY_NOTICES.md is missing");
const notices = fs.readFileSync(noticesPath, "utf8");
const results = Object.entries(direct).map(([name, expectedVersion]) => {
  const metadata = JSON.parse(fs.readFileSync(path.join(process.cwd(), "node_modules", name, "package.json"), "utf8")) as PackageMetadata;
  const license = typeof metadata.license === "string" ? metadata.license : metadata.license?.type;
  const repository = typeof metadata.repository === "string" ? metadata.repository : metadata.repository?.url;
  if (!license || (!repository && !metadata.homepage)) throw new Error(`Dependency metadata incomplete: ${name}`);
  if (metadata.version !== expectedVersion) throw new Error(`Dependency version mismatch: ${name}`);
  if (!notices.includes(`| ${name} | ${metadata.version} | ${license} |`)) throw new Error(`Dependency notice is missing or stale: ${name}`);
  return { name, version: metadata.version, license, officialUrl: repository ?? metadata.homepage };
});
console.log(JSON.stringify(results, null, 2));
