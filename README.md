# Mangled Agents

A local-first workspace for staff engineers to organize themselves and orchestrate Claude Code agents across projects — built around **Mangler**, a primary agent you chat with.

Run it with `npx`, point it at your project folders, and let Mangler track your work and supervise coding agents that implement tickets.

```bash
npx mangled-agents
```

It starts a local server (bound to `127.0.0.1`), serves the web app, and opens your browser.

## What it does

- **Mangler** — a chat agent (Claude API) that tracks your tasks and notes and can act on your workspace through tools: create/move kanban tickets, capture notes, and delegate work to coding agents.
- **Projects & kanban** — add a local folder as a project; each gets its own board with drag-and-drop tickets.
- **Interactive terminals** — launch a real `claude` session in a project (or from a ticket) and drive it in an in-browser terminal.
- **Orchestrated agents** — delegate a ticket to a Claude Code agent. It **plans first**, the plan is **approved** (by Mangler or by you), then it executes **autonomously** in the project folder. Watch every run live.
- **Active Agents** — one place to see and interact with every terminal session and orchestrated run, approve plans, and stop agents.
- **Custom agents, skills & rules** — author Claude-Code-compatible markdown (`.claude/agents`, `.claude/skills`, `.claude/rules`) per project or globally; delegated agents pick them up automatically.
- **Optional honcho.dev memory** — when enabled, Mangler remembers you across conversations.

## Requirements

- **Node.js ≥ 20**
- A **Claude API key** (`CLAUDE_API_KEY` or `ANTHROPIC_API_KEY`).
- The **`claude` CLI** on your `PATH` for *interactive terminal* sessions. Orchestrated agents use the bundled Claude Agent SDK and don't require a separate install.

## Configuration

Set these via the environment or a `.env` file in the directory you run from (see `.env.example`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `CLAUDE_API_KEY` (or `ANTHROPIC_API_KEY`) | yes | Powers Mangler and orchestrated agents |
| `HONCHO_DEV_API_KEY` | no | Enables the optional honcho.dev memory integration |
| `PORT` | no | Server port (default `4173`) |
| `MANGLED_DATA_DIR` | no | Where data lives (default `~/.mangled-agents`) |
| `MANGLED_CLAUDE_BIN` | no | Path to the `claude` binary for terminals (default `claude`) |
| `MANGLED_HONCHO_WORKSPACE` | no | Honcho workspace id (default `mangled-agents`) |

Flags: `--port <n>`, `--no-open`.

Data (projects, tickets, notes, tasks, agent runs) is stored in a local SQLite database under the data dir. Your project folders are never modified except by agents you run.

## Security

Mangled Agents binds to `127.0.0.1` only. It can browse your filesystem and run Claude Code agents that edit files and execute commands in the folders you add — treat it like any tool that runs code on your machine. Orchestrated agents pause for plan approval before executing.

## Development

```bash
npm install
npm run dev        # Vite (5173) + API server (4173) with live reload
npm run build      # build client + server into dist/
npm start          # run the built app
npm test           # unit/integration tests (vitest)
npm run typecheck && npm run lint
```

## Architecture

Single npm package, TypeScript throughout.

- **Server** — Express + `ws`, SQLite (`better-sqlite3`). Mangler runs on the Anthropic Messages API with a streaming tool-use loop; orchestrated agents run on `@anthropic-ai/claude-agent-sdk` (plan mode → `canUseTool` approval gate → `acceptEdits`). Interactive terminals use `@lydell/node-pty` streamed over `/ws/term`.
- **Client** — React + Vite, TanStack Query, a small "clean light lab" design system, and xterm.js terminals. Realtime updates flow over a multiplexed `/ws` socket.

The server is bundled with `tsup` (native modules kept external) and the client with Vite; both ship pre-built in the published package.
