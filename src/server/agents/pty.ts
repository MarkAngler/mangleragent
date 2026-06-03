import * as nodePty from "@lydell/node-pty";
import type { IPty } from "@lydell/node-pty";
import { WebSocketServer, type WebSocket } from "ws";
import { runsRepo } from "../db/runs";
import { broadcast, registerUpgradeHandler } from "../realtime/hub";

const CLAUDE_BIN = process.env.MANGLED_CLAUDE_BIN ?? "claude";
const SCROLLBACK_LIMIT = 200_000;

interface PtySession {
  term: IPty;
  buffer: string;
  sockets: Set<WebSocket>;
  killing: boolean;
}

const sessions = new Map<string, PtySession>();
const termWss = new WebSocketServer({ noServer: true });

interface SpawnOpts {
  sessionId?: string;
  resume?: boolean;
}

export function ptyArgs(opts?: SpawnOpts): string[] {
  if (!opts?.sessionId) return [];
  return opts.resume ? ["--resume", opts.sessionId] : ["--session-id", opts.sessionId];
}

export function startPtySession(runId: string, cwd: string, opts?: SpawnOpts): void {
  let term: IPty;
  try {
    term = nodePty.spawn(CLAUDE_BIN, ptyArgs(opts), {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd,
      env: process.env as Record<string, string>,
    });
  } catch (err) {
    runsRepo.setStatus(runId, "failed");
    broadcast({ type: "run.updated", runId });
    console.error(`pty spawn failed for ${runId}:`, (err as Error).message);
    return;
  }

  const session: PtySession = { term, buffer: "", sockets: new Set(), killing: false };
  sessions.set(runId, session);
  runsRepo.setStatus(runId, "running");
  broadcast({ type: "run.updated", runId });

  term.onData((data) => {
    session.buffer = (session.buffer + data).slice(-SCROLLBACK_LIMIT);
    for (const ws of session.sockets) if (ws.readyState === ws.OPEN) ws.send(data);
  });

  term.onExit(() => {
    runsRepo.setStatus(runId, session.killing ? "stopped" : "done");
    broadcast({ type: "run.updated", runId });
    for (const ws of session.sockets) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    sessions.delete(runId);
  });
}

export function stopPtySession(runId: string): boolean {
  const session = sessions.get(runId);
  if (!session) return false;
  session.killing = true;
  session.term.kill();
  return true;
}

export function isPtyAlive(runId: string): boolean {
  return sessions.has(runId);
}

function attachSocket(runId: string, ws: WebSocket): void {
  let session = sessions.get(runId);
  if (!session) {
    // The PTY process is gone (e.g. the server restarted). Revive it by resuming the
    // run's recorded conversation, or fresh for legacy runs that predate session tracking.
    const run = runsRepo.get(runId);
    if (run?.kind === "pty") {
      startPtySession(runId, run.cwd, run.sdkSessionId ? { sessionId: run.sdkSessionId, resume: true } : undefined);
      session = sessions.get(runId);
    }
  }
  if (!session) {
    ws.send("\r\n\x1b[2m[session has ended]\x1b[0m\r\n");
    ws.close();
    return;
  }
  if (session.buffer) ws.send(session.buffer);
  session.sockets.add(ws);

  ws.on("message", (raw) => {
    const data = raw.toString();
    if (data.charCodeAt(0) === 0) {
      try {
        const control = JSON.parse(data.slice(1)) as { type: string; cols?: number; rows?: number };
        if (control.type === "resize" && control.cols && control.rows) session.term.resize(control.cols, control.rows);
      } catch {
        /* ignore malformed control frame */
      }
      return;
    }
    session.term.write(data);
  });

  ws.on("close", () => session.sockets.delete(ws));
  ws.on("error", () => session.sockets.delete(ws));
}

export function installPtyTerminals(): void {
  registerUpgradeHandler((req, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (url.pathname !== "/ws/term") return false;
    const runId = url.searchParams.get("runId") ?? "";
    termWss.handleUpgrade(req, socket, head, (ws) => attachSocket(runId, ws));
    return true;
  });
}
