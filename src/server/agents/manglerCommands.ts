import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { promisify } from "node:util";
import { configRepo } from "../db/config";
import { projectsRepo } from "../db/projects";
import { broadcast } from "../realtime/hub";

const pexec = promisify(exec);

const CMD_TIMEOUT = 120_000;
const MAX_BUFFER = 8 * 1024 * 1024;
const MAX_OUTPUT = 16_000;
const APPROVAL_TIMEOUT = 5 * 60_000;

interface Decision {
  approved: boolean;
  reason?: string;
}

// Live approvals keyed by commandId, mirroring the orchestrator's pendingApprovals.
// Ephemeral on purpose: a Mangler turn is already in-memory fire-and-forget.
const pending = new Map<string, (decision: Decision) => void>();

export function decideCommand(commandId: string, approved: boolean, reason?: string): boolean {
  const resolve = pending.get(commandId);
  if (!resolve) return false;
  pending.delete(commandId);
  resolve({ approved, reason });
  return true;
}

function awaitApproval(conversationId: string, commandId: string, command: string, cwd: string): Promise<Decision> {
  broadcast({ type: "mangler.command", conversationId, commandId, command, cwd });
  return new Promise<Decision>((resolve) => {
    const timer = setTimeout(() => {
      if (pending.delete(commandId)) resolve({ approved: false, reason: "approval timed out" });
    }, APPROVAL_TIMEOUT);
    pending.set(commandId, (decision) => {
      clearTimeout(timer);
      resolve(decision);
    });
  });
}

export function resolveCwd(projectId?: string): { dir: string } | { error: string } {
  if (projectId) {
    const project = projectsRepo.get(projectId);
    if (!project) return { error: "project not found" };
    if (!fs.existsSync(project.path)) return { error: `project path does not exist: ${project.path}` };
    return { dir: project.path };
  }
  const workdir = configRepo.get("mangler_cli_workdir");
  if (!workdir) return { error: "no working directory: pass a projectId or set a default CLI working directory in Settings" };
  if (!fs.existsSync(workdir)) return { error: `CLI working directory does not exist: ${workdir}` };
  return { dir: workdir };
}

function truncate(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…(truncated)` : text;
}

export async function execCommand(command: string, cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await pexec(command, { cwd, timeout: CMD_TIMEOUT, maxBuffer: MAX_BUFFER });
    return { exitCode: 0, stdout: truncate(stdout), stderr: truncate(stderr) };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string; message: string };
    return {
      exitCode: typeof e.code === "number" ? e.code : 1,
      stdout: truncate(e.stdout ?? ""),
      stderr: truncate(e.stderr || e.message),
    };
  }
}

export async function runManglerCommand(input: { command: string; projectId?: string }, ctx: { conversationId: string }): Promise<unknown> {
  const cwd = resolveCwd(input.projectId);
  if ("error" in cwd) return cwd;

  if (!configRepo.getBool("mangler_cli_autorun", false)) {
    const commandId = randomUUID();
    const decision = await awaitApproval(ctx.conversationId, commandId, input.command, cwd.dir);
    broadcast({ type: "mangler.command_resolved", conversationId: ctx.conversationId, commandId, approved: decision.approved });
    if (!decision.approved) return { denied: true, reason: decision.reason ?? "user denied the command" };
  }

  return execCommand(input.command, cwd.dir);
}
