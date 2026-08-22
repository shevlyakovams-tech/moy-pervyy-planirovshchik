import type { ChildProcess } from "node:child_process";

export type Health = { status: string; appVersion: string; schemaVersion: number };
export type SupervisorDependencies = {
  portIsFree: () => Promise<boolean>;
  spawnServer: () => ChildProcess;
  probeHealth: () => Promise<Health | null>;
  delay: (milliseconds: number) => Promise<void>;
  log: (code: string, operation: string) => void;
};

export class ServerSupervisor {
  private child: ChildProcess | null = null;
  private intentionalStop = false;
  private restartUsed = false;

  constructor(private readonly expected: Pick<Health, "appVersion" | "schemaVersion">, private readonly dependencies: SupervisorDependencies) {}

  async start(): Promise<"started" | "existing"> {
    if (!(await this.dependencies.portIsFree())) {
      const health = await this.dependencies.probeHealth();
      if (this.isExpected(health)) return "existing";
      throw new Error("PORT_OCCUPIED_BY_FOREIGN_PROCESS");
    }
    await this.spawnAndWait();
    return "started";
  }

  async stop(): Promise<void> {
    this.intentionalStop = true;
    const child = this.child;
    if (!child || child.killed) return;
    let exited = false;
    child.kill();
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => { exited = true; resolve(); })),
      this.dependencies.delay(5000).then(() => { if (!exited) child.kill("SIGKILL"); })
    ]);
  }

  private async spawnAndWait(): Promise<void> {
    const child = this.dependencies.spawnServer();
    this.child = child;
    child.once("exit", () => { void this.onUnexpectedExit(child); });
    const healthy = await this.waitForHealth(15_000);
    if (!healthy) {
      child.kill();
      throw new Error("HEALTH_CHECK_TIMEOUT");
    }
  }

  private async waitForHealth(timeoutMs: number): Promise<boolean> {
    const attempts = Math.ceil(timeoutMs / 250);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const health = await this.dependencies.probeHealth();
      if (this.isExpected(health)) return true;
      await this.dependencies.delay(250);
    }
    return false;
  }

  private isExpected(health: Health | null): boolean {
    return health?.status === "ok" && health.appVersion === this.expected.appVersion && health.schemaVersion === this.expected.schemaVersion;
  }

  private async onUnexpectedExit(exitedChild: ChildProcess): Promise<void> {
    if (this.child !== exitedChild || this.intentionalStop) return;
    this.child = null;
    if (this.restartUsed) {
      this.dependencies.log("SERVER_RESTART_EXHAUSTED", "server_exit");
      return;
    }
    this.restartUsed = true;
    this.dependencies.log("SERVER_RESTART_ONCE", "server_exit");
    await this.dependencies.delay(1000);
    try { await this.spawnAndWait(); }
    catch { this.dependencies.log("SERVER_RESTART_FAILED", "server_restart"); }
  }
}
