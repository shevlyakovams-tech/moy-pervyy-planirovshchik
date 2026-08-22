import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SafeLogger } from "@/electron/safe-logger";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

describe("safe technical log", () => {
  it("ignores unknown personal fields and hashes entity ids", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "utrenniy-log-")); directories.push(directory);
    const file = path.join(directory, "app.log");
    const marker = "ЛИЧНЫЙ-МАРКЕР-9f47";
    const logger = new SafeLogger(file, "0.1.0", 1);
    logger.write({ level: "ERROR", code: "SAVE_FAILED", component: "test", operation: "save", entityId: marker, personalText: marker } as never);
    const log = fs.readFileSync(file, "utf8");
    expect(log).not.toContain(marker);
    expect(log).toContain("entityHash");
  });
});
