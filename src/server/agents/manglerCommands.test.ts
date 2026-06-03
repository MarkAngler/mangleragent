import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate the data dir before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-cli-test-"));
process.env.MANGLED_DATA_DIR = tmp;

vi.mock("../realtime/hub", () => ({ broadcast: vi.fn() }));

const { broadcast } = await import("../realtime/hub");
const { initDb } = await import("../db/index");
const { configRepo } = await import("../db/config");
const { projectsRepo } = await import("../db/projects");
const { resolveCwd, execCommand, decideCommand, runManglerCommand } = await import("./manglerCommands");

const broadcastMock = vi.mocked(broadcast);

beforeAll(() => {
  initDb();
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

// The synchronous part of runManglerCommand emits the approval request before it
// awaits, so the commandId is available on the broadcast mock immediately.
function lastCommandRequest(): { commandId: string; command: string; cwd: string } | undefined {
  for (let i = broadcastMock.mock.calls.length - 1; i >= 0; i--) {
    const msg = broadcastMock.mock.calls[i][0];
    if (msg.type === "mangler.command") return msg;
  }
  return undefined;
}

describe("resolveCwd", () => {
  let dir: string;
  let projectId: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-cwd-"));
    projectId = projectsRepo.create({ path: dir, name: "cli-test" }).id;
  });

  afterAll(() => {
    projectsRepo.remove(projectId);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("uses the project's path when given a projectId", () => {
    expect(resolveCwd(projectId)).toEqual({ dir });
  });

  it("errors for an unknown projectId", () => {
    expect(resolveCwd("does-not-exist")).toEqual({ error: "project not found" });
  });

  it("falls back to the configured working directory", () => {
    configRepo.set("mangler_cli_workdir", dir);
    expect(resolveCwd()).toEqual({ dir });
  });

  it("errors when no projectId and no configured directory", () => {
    configRepo.set("mangler_cli_workdir", "");
    expect(resolveCwd()).toEqual({
      error: "no working directory: pass a projectId or set a default CLI working directory in Settings",
    });
  });

  it("errors when the configured directory does not exist", () => {
    const missing = path.join(dir, "nope");
    configRepo.set("mangler_cli_workdir", missing);
    expect(resolveCwd()).toEqual({ error: `CLI working directory does not exist: ${missing}` });
  });
});

describe("execCommand", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-exec-"));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns exit code 0 and stdout for a successful command", async () => {
    const result = await execCommand("echo hello", dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello");
  });

  it("captures stderr without failing", async () => {
    const result = await execCommand("echo oops 1>&2", dir);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("oops");
  });

  it("returns a nonzero exit code instead of throwing", async () => {
    const result = await execCommand("exit 3", dir);
    expect(result.exitCode).toBe(3);
  });
});

describe("runManglerCommand approval gate", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-gate-"));
    configRepo.set("mangler_cli_workdir", dir);
    configRepo.set("mangler_cli_autorun", "false");
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("runs the command once approved", async () => {
    broadcastMock.mockClear();
    const pending = runManglerCommand({ command: "echo approved" }, { conversationId: "c1" });
    const request = lastCommandRequest();
    expect(request).toBeDefined();
    expect(decideCommand(request!.commandId, true)).toBe(true);
    const result = (await pending) as { exitCode: number; stdout: string };
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("approved");
  });

  it("returns denied when the user denies", async () => {
    broadcastMock.mockClear();
    const pending = runManglerCommand({ command: "echo nope" }, { conversationId: "c1" });
    const request = lastCommandRequest();
    expect(request).toBeDefined();
    decideCommand(request!.commandId, false, "not now");
    expect(await pending).toEqual({ denied: true, reason: "not now" });
  });

  it("returns false from decideCommand for an unknown id", () => {
    expect(decideCommand("unknown-id", true)).toBe(false);
  });

  it("runs immediately without an approval request when autorun is on", async () => {
    configRepo.set("mangler_cli_autorun", "true");
    broadcastMock.mockClear();
    const result = (await runManglerCommand({ command: "echo auto" }, { conversationId: "c1" })) as { exitCode: number };
    expect(result.exitCode).toBe(0);
    expect(broadcastMock.mock.calls.some((c) => c[0].type === "mangler.command")).toBe(false);
    configRepo.set("mangler_cli_autorun", "false");
  });
});
