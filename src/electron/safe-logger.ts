import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type LogLevel = "INFO" | "WARN" | "ERROR";
export type SafeLogEvent = {
  level: LogLevel;
  code: string;
  component: string;
  operation: string;
  correlationId?: string;
  entityId?: string;
  stack?: string;
};

const MAX_SIZE = 2 * 1024 * 1024;
const MAX_FILES = 5;

export class SafeLogger {
  private readonly salt = randomBytes(16);

  constructor(private readonly filePath: string, private readonly appVersion: string, private readonly schemaVersion: number) {}

  entityHash(id: string): string {
    return createHash("sha256").update(this.salt).update(id).digest("hex").slice(0, 12);
  }

  write(event: SafeLogEvent): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.rotateIfNeeded();
    const safe = {
      timestamp: new Date().toISOString(),
      level: event.level,
      code: event.code.slice(0, 80),
      component: event.component.slice(0, 80),
      operation: event.operation.slice(0, 80),
      correlationId: event.correlationId?.slice(0, 80),
      entityHash: event.entityId ? this.entityHash(event.entityId) : undefined,
      stack: event.stack ? sanitizeStack(event.stack) : undefined,
      appVersion: this.appVersion,
      schemaVersion: this.schemaVersion
    };
    fs.appendFileSync(this.filePath, `${JSON.stringify(safe)}\n`, "utf8");
  }

  private rotateIfNeeded(): void {
    if (!fs.existsSync(this.filePath) || fs.statSync(this.filePath).size < MAX_SIZE) return;
    const oldest = `${this.filePath}.${MAX_FILES - 1}`;
    if (fs.existsSync(oldest)) fs.rmSync(oldest);
    for (let index = MAX_FILES - 2; index >= 1; index -= 1) {
      const source = `${this.filePath}.${index}`;
      if (fs.existsSync(source)) fs.renameSync(source, `${this.filePath}.${index + 1}`);
    }
    fs.renameSync(this.filePath, `${this.filePath}.1`);
  }
}

export function sanitizeStack(stack: string): string {
  return stack
    .split("\n")
    .slice(0, 20)
    .map((line) => line.replace(/https?:\/\/\S+/g, "[url]").replace(/[?&][^\s)]+/g, "[query]").replace(/[\r\n]/g, " "))
    .join("\n")
    .slice(0, 4000);
}
