import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { ServerSupervisor, type Health } from "@/electron/supervisor";

function child(): ChildProcess {
  const emitter = new EventEmitter() as ChildProcess;
  Object.assign(emitter, { killed: false, kill: vi.fn(function (this: ChildProcess) { Object.assign(this, { killed: true }); return true; }) });
  return emitter;
}
const expected: Health = { status: "ok", appVersion: "0.1.0", schemaVersion: 2 };

describe("server supervisor", () => {
  it("refuses a foreign process on the fixed port", async () => {
    const supervisor = new ServerSupervisor(expected, { portIsFree: async () => false, spawnServer: vi.fn(), probeHealth: async () => null, delay: async () => undefined, log: vi.fn() });
    await expect(supervisor.start()).rejects.toThrow("PORT_OCCUPIED_BY_FOREIGN_PROCESS");
  });

  it("recognizes the already running application", async () => {
    const spawnServer = vi.fn();
    const supervisor = new ServerSupervisor(expected, { portIsFree: async () => false, spawnServer, probeHealth: async () => expected, delay: async () => undefined, log: vi.fn() });
    await expect(supervisor.start()).resolves.toBe("existing");
    expect(spawnServer).not.toHaveBeenCalled();
  });

  it("waits for health and uses only one restart after an unexpected exit", async () => {
    const children = [child(), child(), child()];
    let index = 0;
    const spawnServer = vi.fn(() => children[index++]!);
    const log = vi.fn();
    const supervisor = new ServerSupervisor(expected, { portIsFree: async () => true, spawnServer, probeHealth: async () => expected, delay: async () => undefined, log });
    await expect(supervisor.start()).resolves.toBe("started");
    children[0]!.emit("exit", 1);
    await vi.waitFor(() => expect(spawnServer).toHaveBeenCalledTimes(2));
    children[1]!.emit("exit", 1);
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith("SERVER_RESTART_EXHAUSTED", "server_exit"));
    expect(spawnServer).toHaveBeenCalledTimes(2);
  });

  it("times out when health never succeeds", async () => {
    const process = child();
    const supervisor = new ServerSupervisor(expected, { portIsFree: async () => true, spawnServer: () => process, probeHealth: async () => null, delay: async () => undefined, log: vi.fn() });
    await expect(supervisor.start()).rejects.toThrow("HEALTH_CHECK_TIMEOUT");
    expect(process.kill).toHaveBeenCalledOnce();
  });

  it("force-stops only its known child after the graceful timeout", async () => {
    const process = child();
    const supervisor = new ServerSupervisor(expected, { portIsFree: async () => true, spawnServer: () => process, probeHealth: async () => expected, delay: async () => undefined, log: vi.fn() });
    await supervisor.start();
    await supervisor.stop();
    expect(process.kill).toHaveBeenCalledTimes(2);
    expect(process.kill).toHaveBeenLastCalledWith("SIGKILL");
  });
});
