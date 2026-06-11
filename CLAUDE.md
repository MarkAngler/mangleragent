# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Mangled Agents** (`mangled-agents`) is a local-first, single-package full-stack TypeScript app for orchestrating Claude Code agents across projects. It's centered on **Mangler**, a chat agent you talk to that tracks work and delegates coding tasks. The server binds to `127.0.0.1` only and runs Claude Code agents that edit files and execute commands on the user's machine.

## Commands

```bash
npm install
npm run dev        # server + client concurrently (see note below)
npm run build      # build:client (Vite) then build:server (tsup) → dist/
npm start          # node bin/cli.js — runs the built app (flags: --port <n>, --no-open)
npm test           # vitest run
npm run typecheck  # tsc --noEmit
npm run lint       # eslint .  (no Prettier; ESLint only)
```

- **`npm run dev`** runs two processes via `concurrently`:
  - **server** — `dev:server` is just `nodemon --quiet`; the real entry, watch paths, and env live in `nodemon.json` (`tsx src/server/index.ts`, `PORT=4173`, `MANGLED_DEV=1`).
  - **client** — Vite on `5173`, proxying `/api` and `/ws` → `4173`.
- **Single test:** `npx vitest run src/server/defs.test.ts` (test glob is `src/**/*.test.{ts,tsx}`).
- **`build:server`** uses tsup (ESM, target node20) and keeps native/SDK modules external: `better-sqlite3`, `@lydell/node-pty`, `@anthropic-ai/claude-agent-sdk`.

## Environment & setup

- Requires a Claude API key: `CLAUDE_API_KEY` or `ANTHROPIC_API_KEY`. The `claude` CLI must be on `PATH` only for *interactive Claude Code* sessions; orchestrated agents use the bundled Agent SDK. See `.env.example` for all vars (`PORT`, `MANGLED_DATA_DIR`, `MANGLED_CLAUDE_BIN`, `MANGLED_HONCHO_WORKSPACE`, `HONCHO_DEV_API_KEY`).
- Optional: `DATABRICKS_HOST` + `DATABRICKS_TOKEN` (aliases: `DATABRICKS_WORKSPACE` / `DATABRICKS_PAT`) let Mangler run through the Databricks AI Gateway (OpenAI-compatible) instead of the direct Anthropic API; switch providers in Settings. Mangler chat only — orchestrated agents and interactive Claude Code sessions still use Anthropic / the `claude` CLI.
- `engines` requires Node ≥20. **Local caveat:** use nvm Node 24 — `better-sqlite3` is a native module, and a Node ABI mismatch causes runtime crashes. Rebuild dependencies after switching Node versions.
- Data and the SQLite DB live under `~/.mangled-agents` (override with `MANGLED_DATA_DIR`). The whole data directory can also be relocated at runtime from Settings → data directory, which records a `data-location` pointer in the anchor so the move survives a restart.

## Architecture

Single npm package, three source roots:

- `src/server/` — Express 5 + `ws`, SQLite via `better-sqlite3`. Entry `src/server/index.ts` mounts the API routers, the WebSocket hub, and the PTY upgrade handler.
- `src/client/` — React 19 + Vite, TanStack Query, xterm.js. Routing in `src/client/App.tsx`.
- `src/shared/` — code used by both: Zod entity schemas (`types.ts`), kanban board logic (`board.ts`), and WebSocket message contracts (`ws.ts`).

### Three execution models (the non-obvious core)

1. **Mangler chat** — `src/server/agents/mangler.ts` + `manglerTools.ts`. An Anthropic Messages API streaming tool-use loop. Tools mutate projects/tickets/notes/tasks and can `delegate_ticket` to spawn an orchestrated run. Output streams to clients over WS (`mangler.delta` / `mangler.tool` / `mangler.done`).
2. **Orchestrated agent** — `src/server/agents/orchestrator.ts`. Runs `@anthropic-ai/claude-agent-sdk` `query()` with `cwd` set to the project path. Flow: **plan mode → `canUseTool` approval gate → `acceptEdits`**. Approval is either `approver: "human"` (client calls `/api/permissions/:id/decide`) or `"agent"` (an LLM reviews the plan). The SDK auto-loads `.claude/agents|skills|rules` from the project CWD.
3. **Claude Code (PTY)** — `src/server/agents/pty.ts`. Spawns the `claude` CLI through `@lydell/node-pty`, byte-streamed over `/ws/term`.

### Cross-cutting

- **Realtime hub** — `src/server/realtime/hub.ts`. A multiplexed `/ws` socket broadcasts board/run/permission/mangler events to all clients; a separate `/ws/term` upgrade carries PTY byte streams.
- **Definitions** — `src/server/defs.ts` + `src/server/api/defs.ts`. Read/write Claude-Code markdown under `.claude/<kind>/` at **global** scope (`~/.mangled-agents/.claude/`) or **project** scope (the project folder). Edited from the Definitions page; orchestrated agents pick them up automatically via CWD.
- **DB layer** — `src/server/db/`. One repo file per entity (projects, tickets, notes, tasks, chat, runs, events, permissions, config); schema in `schema.ts`.
- **Optional memory** — `src/server/honcho.ts`. honcho.dev integration; off by default, toggled in Settings. `recallUserMemory` runs before a turn, `recordTurn` after.

## Conventions

Behavioral and quality rules are defined in `.claude/rules/` and must be followed — they are the source of truth, not duplicated here:

- `prod-code.md` — zero-tolerance cleanliness (KISS / YAGNI / DRY), Conventional Commits, **no references to Claude/Anthropic/AI tools in commit messages**, and lint + typecheck + build must pass before work is considered done.
- `andrej-karpathy.md` — think before coding, simplicity first, surgical diffs.
- `reasoning.md` — constraint-first reasoning, self-audit/source-tagging, and addressing every part of a multi-part request.
- `testing.md` — perform live testing of every feature, fix, or refactor.
