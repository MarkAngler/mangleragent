import * as nodePty from "@lydell/node-pty";
import type { IPty } from "@lydell/node-pty";
// @xterm/headless is CJS whose named export tsx can't resolve at runtime, so reach Terminal
// via the default; @xterm/addon-serialize ships a normal ESM named export.
import xtermHeadless from "@xterm/headless";
import type { Terminal as HeadlessTerminal } from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebSocketServer, type WebSocket } from "ws";
import { runsRepo } from "../db/runs";
import { broadcast, registerUpgradeHandler } from "../realtime/hub";

const CLAUDE_BIN = process.env.MANGLED_CLAUDE_BIN ?? "claude";
const SCROLLBACK_ROWS = 1000;
// The claude TUI streams spinner/token frames while it works, so a quiet stretch
// means it has reached its prompt and is waiting for the user. 4s avoids flicker
// between redraw frames while staying responsive.
const IDLE_MS = 4000;
// Even at its prompt the TUI emits lone redraw frames (cursor blink, input box). Those must
// not count as "claude resumed activity", or `waiting` would flip off and back on and re-toast
// every idle cycle. Only sustained output — a second frame within this window — clears waiting.
const ACTIVE_GRACE_MS = 750;

interface PtySession {
  term: IPty;
  // A headless xterm mirrors the TUI's screen so a reattaching client gets a clean
  // serialized snapshot of the current state, not a replay of raw cursor-relative frames.
  emulator: HeadlessTerminal;
  serializer: SerializeAddon;
  sockets: Set<WebSocket>;
  killing: boolean;
  lastDataAt: number;
  waiting: boolean;
  idleTimer: ReturnType<typeof setInterval> | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
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

  // allowProposedApi: SerializeAddon reads term.buffer, which headless gates behind this flag.
  const emulator = new xtermHeadless.Terminal({ cols: 80, rows: 24, scrollback: SCROLLBACK_ROWS, allowProposedApi: true });
  const serializer = new SerializeAddon();
  emulator.loadAddon(serializer);

  const session: PtySession = {
    term,
    emulator,
    serializer,
    sockets: new Set(),
    killing: false,
    lastDataAt: Date.now(),
    waiting: false,
    idleTimer: null,
    graceTimer: null,
  };
  sessions.set(runId, session);
  runsRepo.setStatus(runId, "running");
  broadcast({ type: "run.updated", runId });

  term.onData((data) => {
    const armedAt = Date.now();
    session.lastDataAt = armedAt;
    session.emulator.write(data);
    for (const ws of session.sockets) if (ws.readyState === ws.OPEN) ws.send(data);
    if (session.waiting && !session.graceTimer) {
      session.graceTimer = setTimeout(() => {
        session.graceTimer = null;
        // A later frame arrived means output is genuinely streaming — claude resumed work.
        // A lone redraw frame leaves lastDataAt at armedAt, so waiting stays set and no toast repeats.
        if (session.waiting && session.lastDataAt > armedAt) {
          session.waiting = false;
          broadcast({ type: "run.waiting", runId, waiting: false });
        }
      }, ACTIVE_GRACE_MS);
    }
  });

  session.idleTimer = setInterval(() => {
    if (session.killing || session.waiting) return;
    if (Date.now() - session.lastDataAt > IDLE_MS) {
      session.waiting = true;
      broadcast({ type: "run.waiting", runId, waiting: true });
    }
  }, 1000);

  term.onExit(() => {
    if (session.idleTimer) clearInterval(session.idleTimer);
    if (session.graceTimer) clearTimeout(session.graceTimer);
    broadcast({ type: "run.waiting", runId, waiting: false });
    runsRepo.setStatus(runId, session.killing ? "stopped" : "done");
    broadcast({ type: "run.updated", runId });
    for (const ws of session.sockets) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    session.emulator.dispose();
    sessions.delete(runId);
  });
}

export function stopPtySession(runId: string): boolean {
  const session = sessions.get(runId);
  if (!session) return false;
  session.killing = true;
  if (session.idleTimer) clearInterval(session.idleTimer);
  if (session.graceTimer) clearTimeout(session.graceTimer);
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
  const snapshot = session.serializer.serialize();
  if (snapshot) ws.send(snapshot);
  session.sockets.add(ws);

  ws.on("message", (raw) => {
    const data = raw.toString();
    if (data.charCodeAt(0) === 0) {
      try {
        const control = JSON.parse(data.slice(1)) as { type: string; cols?: number; rows?: number };
        if (control.type === "resize" && control.cols && control.rows) {
          session.term.resize(control.cols, control.rows);
          session.emulator.resize(control.cols, control.rows);
        }
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
