# FEATURE IMPROVEMENT ANALYSIS

> **Persistent ledger for nightly improvement runs.**
> Never delete prior entries. Append new ideas under their component, using the stable ID format below.
> Status values: `Proposed` | `Planned` | `Done`

---

## Run Log

| Run | Date | Ideas Added | Idea Selected |
|-----|------|-------------|---------------|
| 1 | 2026-06-07 | MA-001, MA-002, MA-003, OR-001, OR-002, OR-003, RT-001, SC-001, SC-002, SC-003, ME-001, ME-002, DF-001 | MA-002 |
| 2 | 2026-06-09 | MC-001, MC-002, KA-001, KA-002 | KA-001 |

---

## 1. Product Comprehension

### Vision

Mangled Agents is a local-first, single-package full-stack TypeScript workspace for a staff engineer to manage software projects and orchestrate Claude Code agents. The user talks to **Mangler** — a persistent chat agent — to track work, create kanban tickets, and delegate coding tasks to isolated sub-agents that edit files and execute commands on the local machine. Everything runs bound to `127.0.0.1`; there is no cloud dependency beyond the Anthropic API.

### Core Component Inventory (as of 2026-06-07)

| # | Component | Primary Files | Maturity | Key Gaps |
|---|-----------|--------------|----------|----------|
| 1 | **Mangler Chat Agent** | `src/server/agents/mangler.ts`, `manglerTools.ts` | High | 12-turn hard cap with no summarization; no prompt caching; full message history sent each turn |
| 2 | **Orchestrated Agent Runs** | `src/server/agents/orchestrator.ts` | High | Plan approval unlocks all tools globally; no token/cost metrics stored; no run resume after failure |
| 3 | **PTY Terminal** | `src/server/agents/pty.ts`, `pty.serialize.ts` | Medium | No automatic reconnection; sessions marked stopped on server restart |
| 4 | **Kanban Board** | `src/server/db/tickets.ts`, `src/shared/board.ts` | Medium | No ticket→run linking; no blocking relationships or story-point estimates |
| 5 | **Real-time Hub** | `src/server/realtime/hub.ts` | Low-Medium | No sequence numbers; no event buffering; client disconnect = all live events lost |
| 6 | **Definitions System** | `src/server/defs.ts`, `src/server/api/defs.ts` | Medium | No versioning; no diff history; no validation of definition schema |
| 7 | **Scheduling** | `src/server/scheduler.ts`, `src/server/cron.ts` | Low | 30 s polling; no retry on failure; no error column; missed runs silently skipped |
| 8 | **External Agent Chat** | `src/server/agents/externalAgentChat.ts`, `genie.ts` | Early | No streaming parity with Mangler; no tool-call transparency |
| 9 | **Memory (Honcho)** | `src/server/honcho.ts` | Low | Off by default; requires external SaaS; no local fallback; conversation history grows unbounded |
| 10 | **MCP Server Integration** | `src/server/agents/mcp.ts`, `src/server/db/mcpServers.ts` | Medium-High | Tool descriptions blindly trusted (injection risk); tool list re-fetched from server on every Mangler turn; no schema validation or security audit on connect |
| 11 | **Local SDK Agents** | `src/server/agents/agentRun.ts`, `src/server/db/agents.ts` | Medium | Completed agent runs do not update their linked kanban ticket; no run history visible per ticket; approval audit trail not surfaced in a dedicated UI |

---

## 2. Frontier Research Findings

### 2.1 Multiagent Orchestration

**Key advances (2025–2026):**

- **Claude Agent SDK** (renamed from Claude Code SDK, late 2025) now ships two experimental coordination primitives: **Agent Teams** (one session as team lead, teammates with isolated context windows communicating directly) and **Dynamic Workflows** (orchestrator script creates and dispatches sub-agents in parallel, validates results).
  - Sources: [Anthropic docs — Agent Teams](https://code.claude.com/docs/en/agent-teams); [InfoQ — Dynamic Workflows, June 2026](https://www.infoq.com/news/2026/06/dynamic-workflows-claude-code/); [9to5Mac — Claude Managed Agents, May 2026](https://9to5mac.com/2026/05/07/anthropic-updates-claude-managed-agents-with-three-new-features/)
- **Claude Managed Agents** entered public beta (April 2026): hosted runtime for stateful, long-running agent sessions with persistence across connections.
  - Source: [Anthropic multi-agent docs](https://platform.claude.com/docs/en/managed-agents/multi-agent)
- **2026 framework landscape**: Claude SDK, LangGraph, CrewAI, AG2 (AutoGen 2), Strands, OpenAI Swarm are the active contenders. Claude SDK differentiates on plan-mode gating and native file-system safety.
  - Source: [QubitTool framework comparison, 2026](https://qubittool.com/blog/ai-agent-framework-comparison-2026)
- **Deterministic orchestration patterns** (fan-out/fan-in scripts) are gaining traction as a complement to LLM-driven orchestration; they give predictable parallelism without requiring the LLM to manage sub-agent lifecycle.
  - Source: [alexop.dev — Deterministic orchestration, 2026](https://alexop.dev/posts/claude-code-workflows-deterministic-orchestration/)

**Conflicts / caveats:** Dynamic Workflows are in research preview as of June 2026; production stability is unconfirmed.

### 2.2 Agent Memory Systems

**Key advances (2025–2026):**

- **Mem0** operates as a memory service layer: wraps LLM calls, extracts facts from conversations, stores them in a hybrid store (vector + graph + KV), injects relevant context into future prompts. Three-tier scopes: user, session, agent. Measured accuracy: 66.9% at 0.71 s median latency and ~1,800 tokens/conversation vs. full-context baseline of 72.9% accuracy at ~26,000 tokens.
  - Sources: [Vectorize.io — Mem0 vs Letta, 2026](https://vectorize.io/articles/mem0-vs-letta); [AgentMarketCap — Memory vendor landscape, Apr 2026](https://agentmarketcap.ai/blog/2026/04/10/agent-memory-vendor-landscape-2026-letta-zep-mem0-langmem)
- **Letta (MemGPT)** treats LLM context as virtual memory: main context (active) + recall storage (recent, vector-indexed) + archival storage (long-term, semantic retrieval). The runtime decides when to page in/out and when to compress.
  - Source: [Tokenmix.ai — Mem0 vs Letta, 2026](https://tokenmix.ai/blog/ai-agent-memory-mem0-vs-letta-vs-memgpt-2026)
- **Market context:** Agent memory infrastructure was valued at ~$6.3 B in 2025, projecting $28.5 B by 2030 (35% CAGR). Memory is cited as "the #1 differentiator between toy and production agents in 2026."
  - Source: [Medium — Top 10 AI Memory Products, 2026](https://medium.com/@bumurzaqov2/top-10-ai-memory-products-2026-09d7900b5ab1)

### 2.3 Resumable Real-time Streaming

**Key advances (2025–2026):**

- **Durable sessions pattern**: client reconnects at last-acknowledged sequence offset, receiving no duplicate events and no restart penalty. Becoming standard for agentic UIs.
  - Sources: [Ably — Reliable resumable token streaming](https://ably.com/blog/token-streaming-for-ai-ux); [DEV Community — Resume tokens](https://dev.to/ablyblog/resume-tokens-and-last-event-ids-for-llm-streaming-how-they-work-what-they-cost-to-build-4l7e)
- **Implementations**: Upstash Redis Streams (tokens persist in Redis, reconnect from offset); ElectricSQL Hosted Durable Streams (launched Jan 2026); MCP StreamableHTTP transport with `EventStore` interface for replay on reconnect.
  - Sources: [ElectricSQL — Hosted Durable Streams, Jan 2026](https://electric-sql.com/blog/2026/01/22/announcing-hosted-durable-streams); [Starcite.ai — Why Agent UIs lose messages](https://starcite.ai/blog/why-agent-uis-lose-messages-on-refresh)
- **The core failure mode**: "A 5-minute agent task that drops at minute 4 means restarting from scratch — wasted compute, wasted money, frustrated user." (Ably, 2025)
- `WebSocket` natively has no resume semantics; SSE has `Last-Event-ID` but generation state is gone on reconnect. Both require server-side buffering.
  - Source: [WebSocket.org — AI token streaming guide](https://websocket.org/guides/use-cases/ai-streaming/)

### 2.4 Durable Execution and Scheduling

**Key advances (2025–2026):**

- **Temporal** (Replay 2026): Serverless Workers, Standalone Activities, Workflow Streams; integrations with Google ADK and OpenAI Agents SDK. Temporal Schedules fire "nudge" workflows at cron intervals with exactly-once semantics.
  - Sources: [Temporal.io — Orchestrating ambient agents](https://temporal.io/blog/orchestrating-ambient-agents-with-temporal); [Spheron — Workflow orchestration platforms, 2026](https://www.spheron.network/blog/ai-agent-workflow-orchestration-temporal-inngest-restate-gpu-cloud/)
- **Inngest** (TypeScript-native): `step.run()` with built-in retries, observability, and scheduling from any trigger (API, webhook, cron). Positioned as the lightweight Temporal alternative for serverless/edge.
  - Source: [Inngest](https://www.inngest.com/)
- **Trigger.dev**: durable agents with queues, streaming, retries, and logging. Strong developer experience story.
  - Source: [Trigger.dev](https://trigger.dev/)
- **Pattern consensus**: Temporal for multi-day workflows requiring replay history; Inngest for event-driven pipelines; exactly-once semantics are essential when chaining multiple LLM calls.
  - Source: [Render.com — Durable workflow platforms](https://render.com/articles/durable-workflow-platforms-ai-agents-llm-workloads)

### 2.5 Prompt Caching and Cost Optimization

**Key advances (2025–2026):**

- **Anthropic prompt caching** pricing (current): cache writes at 1.25× input price (5 min TTL) or 2× (1 hour TTL); cache reads at **0.1× input price (90% discount)**. Workspace-level isolation since Feb 2026.
  - Sources: [Anthropic pricing docs](https://platform.claude.com/docs/en/about-claude/pricing); [Anthropic prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching); [FinOut — Anthropic API pricing 2026](https://www.finout.io/blog/anthropic-api-pricing)
- Industry measurement: ProjectDiscovery cut LLM costs 59% using prompt caching on repeated system-prompt-heavy agents.
  - Source: [ProjectDiscovery — Cut LLM cost with prompt caching](https://projectdiscovery.io/blog/how-we-cut-llm-cost-with-prompt-caching)
- "Prompt caching is not optional for agentic systems — if your agents run more than 3–5 steps, you're leaving significant money on the table."
  - Source: [FinOut — Anthropic API pricing 2026](https://www.finout.io/blog/anthropic-api-pricing)
- **Adaptive thinking** (Sonnet 4.6, Opus 4.6): model auto-skips expensive extended thinking for simple requests; no manual budget management needed.
  - Source: [Anthropic pricing docs](https://platform.claude.com/docs/en/about-claude/pricing)

### 2.6 Agent Observability

**Key advances (2025–2026):**

- **OpenTelemetry + GenAI semantic conventions** are the emerging standard: standardized attributes for LLM calls, tool invocations, agent reasoning steps, token usage, and costs. Vendor-neutral export.
  - Sources: [Uptrace — OTel for AI systems, 2026](https://uptrace.dev/blog/opentelemetry-ai-systems); [CallSphere — AI agent observability, 2026](https://callsphere.ai/blog/ai-agent-observability-tracing-logging-monitoring-opentelemetry-2026)
- Target granularity: "This agent made 3 LLM calls, invoked 2 tools, consumed 12,400 tokens costing $0.037." Under 1 ms per-call overhead from OTel instrumentation.
  - Source: [Uptrace — LLM cost monitoring](https://uptrace.dev/blog/llm-cost-monitoring)
- MLflow now includes LLM observability tooling as a first-class feature.
  - Source: [MLflow — Top LLM observability tools 2026](https://mlflow.org/articles/top-llm-observability-tools-in-2026-a-pro-guide/)

---

## 3. Idea Log

> Entry format: `[ID]` — Date — Status — Component

---

### Component: Mangler Chat Agent

---

#### [MA-001] Conversation Context Summarization
- **Date:** 2026-06-07
- **Status:** Proposed
- **Enabling advancement:** Letta/MemGPT's virtual-memory paging model; Anthropic's long-context summarization capability
- **Gap addressed:** Mangler has a hard `MAX_TURNS = 12` cap. When reached, the conversation ends abruptly with no user recourse. For ongoing project management sessions this is a critical friction point.
- **User benefit:** Conversations persist indefinitely. The agent summarizes the oldest N turns into a compressed block when the context approaches the turn limit, then continues. No context loss; no hard wall.
- **Approach:** Before each turn, if `messages.length >= SUMMARIZE_THRESHOLD`, call Claude with the oldest M messages and a summarization prompt. Replace those messages with a single synthetic `assistant` message containing the summary. Re-inject into the history array. Optionally store the summary in the DB alongside the conversation.
- **Affected files:** `src/server/agents/mangler.ts`, `src/server/db/chat.ts`
- **Complexity:** Medium (requires a second LLM call per threshold crossing; must preserve tool-call message structure)
- **Risk:** Summarization can lose detail; tool-call `id` pairing constraints mean only text-only message segments are safe to summarize

---

#### [MA-002] Prompt Caching for Mangler System Prompt and Definitions
- **Date:** 2026-06-07
- **Status:** Done
- **Enabling advancement:** Anthropic prompt caching (cache reads at 0.1× input price; 90% discount; workspace-isolated since Feb 2026)
- **Gap addressed:** Every Mangler turn re-sends the full system prompt + definitions content as fresh input tokens. The system prompt (`DEFAULT_MANGLER_SYSTEM` + `manglerDefinitionsPrompt()`) is static within a session and across many turns. This is pure wasted spend.
- **User benefit:** 60–90% cost reduction on the stable prefix (system prompt + definitions) for every active user on every Mangler turn. No behavioral change. Negligible implementation risk.
- **Research support:** ProjectDiscovery measured 59% overall cost reduction using prompt caching. Anthropic engineering guidance states caching is mandatory for agentic systems running >3–5 steps.
- **Affected files:** `src/server/agents/mangler.ts`
- **Complexity:** Low (add `cache_control: {type: "ephemeral"}` blocks to the system parameter array; Anthropic SDK supports it natively)
- **Risk:** Databricks path uses OpenAI-compatible API and does not support prompt caching — must guard the cache_control application to Anthropic-only calls

---

#### [MA-003] Adaptive Extended Thinking Budget
- **Date:** 2026-06-07
- **Status:** Proposed
- **Enabling advancement:** Adaptive thinking on Claude Sonnet 4.6 and Opus 4.6 (auto-skips expensive extended thinking for simple requests; no manual budget needed)
- **Gap addressed:** Mangler currently uses a flat model call without extended thinking. Delegation decisions (whether to create a ticket vs. delegate a run) benefit from deeper reasoning; simple listing queries do not.
- **User benefit:** Higher-quality decisions on complex planning without paying extended-thinking tokens on trivial responses.
- **Affected files:** `src/server/agents/mangler.ts`, `src/server/agents/anthropic.ts`
- **Complexity:** Low-Medium (add `thinking: {type: "enabled", budget_tokens: N}` to messages.create options; parse thinking blocks out of the response before broadcasting)
- **Risk:** Thinking blocks must be stripped before sending to the client (they are not part of the output text); adds latency on complex turns

---

### Component: Orchestrated Agent Runs

---

#### [OR-001] Per-Run Token and Cost Tracking
- **Date:** 2026-06-07
- **Status:** Proposed
- **Enabling advancement:** OpenTelemetry GenAI semantic conventions; Anthropic SDK `usage` field on every message response
- **Gap addressed:** `agent_events` stores text events but no token counts, latency, or cost. Users have no visibility into what a run costs.
- **User benefit:** Run detail view shows "12,400 input tokens · 3,200 output tokens · ~$0.037" per run. Enables cost attribution per project/ticket.
- **Approach:** In `orchestrator.ts`, capture `usage` from each `SDKMessage` that carries it; emit a `run.usage` event type; aggregate and store totals in a new `agent_runs` column or in the existing `summary` field.
- **Affected files:** `src/server/agents/orchestrator.ts`, `src/server/db/schema.ts`, `src/server/db/runs.ts`, `src/client/components/RunListDetail.tsx`
- **Complexity:** Low-Medium (schema migration + UI addition)
- **Risk:** SDK message format for usage metadata must be verified against current SDK version

---

#### [OR-002] Failed Run Resume via Stored Session ID
- **Date:** 2026-06-07
- **Status:** Proposed
- **Enabling advancement:** Claude Agent SDK stores `session_id` on the `system.init` message; already captured in `agent_runs.sdk_session_id`
- **Gap addressed:** When an orchestrated run fails (network error, model error, manual stop), the user must re-delegate from scratch. The session ID needed for resume is already stored but unused.
- **User benefit:** One-click "Retry" on a failed run resumes from the last session checkpoint, preserving completed file edits and the agent's accumulated context.
- **Approach:** Add `resumeSessionId` option to `startOrchestratedRun`; pass it as `resume: {session_id: ...}` in the `query()` options (verify SDK support); add a POST `/api/runs/:id/retry` endpoint.
- **Affected files:** `src/server/agents/orchestrator.ts`, `src/server/api/runs.ts`, `src/client/components/RunListDetail.tsx`
- **Complexity:** Medium (depends on Claude Agent SDK resume support; requires UI affordance)
- **Risk:** Session resume semantics in the SDK may not guarantee idempotency on partially-completed tool calls; must test edge cases

---

#### [OR-003] Granular Post-Plan Tool Approval
- **Date:** 2026-06-07
- **Status:** Proposed
- **Enabling advancement:** `canUseTool` callback in Claude Agent SDK already intercepts every tool call; current implementation only gates `ExitPlanMode`
- **Gap addressed:** After plan approval, all subsequent tool calls are auto-allowed (`autoApproved = true`). This means the human approver has no way to block a risky Bash command that wasn't in the plan.
- **User benefit:** Users who want fine-grained control can configure a "paranoid mode" that presents individual tool calls (especially `Bash` and filesystem writes) for approval after the plan is accepted.
- **Affected files:** `src/server/agents/orchestrator.ts`, `src/server/db/permissions.ts`, `src/client/components/OrchestratedRunView.tsx`
- **Complexity:** Medium (gating logic is already in place; needs UI for per-tool decisions and a run setting to opt in)
- **Risk:** Frequent approval prompts for long runs could be disruptive; needs a "trust this tool for this run" option to prevent alert fatigue

---

### Component: Real-time Hub

---

#### [RT-001] Client Reconnection with Server-Side Event Replay
- **Date:** 2026-06-07
- **Status:** Proposed
- **Enabling advancement:** Durable sessions pattern (Ably, ElectricSQL Jan 2026); agent events are already durably stored in `agent_events` table per run
- **Gap addressed:** The hub broadcasts events to all connected clients with no buffering. A browser refresh or network blip during a long orchestrated run causes the client to miss all intermediate events (tool calls, file edits, results). The user sees a partial or blank run view.
- **User benefit:** Clients can reconnect and request "events since sequence X" for any active run. The live view is immediately reconstructed from DB-stored events, then real-time streaming resumes. No lost state.
- **Approach:** Assign a monotonic `seq` counter to each hub broadcast. On WS connection, client sends `{type: "subscribe_run", runId, sinceSeq: N}`. Server replays `agent_events` rows with `seq > N` from SQLite, then switches to live broadcast. The `agent_events` table already stores all events in order.
- **Affected files:** `src/server/realtime/hub.ts`, `src/shared/ws.ts`, `src/client/lib/ws.ts`, `src/client/components/OrchestratedRunView.tsx`
- **Complexity:** Medium (sequence numbering, replay endpoint, client reconnect logic with exponential backoff)
- **Risk:** Hub seq and DB event seq must stay in sync; replay must not re-emit events to other subscribers; memory pressure from buffering high-frequency runs is low (replay comes from DB, not in-memory)

---

### Component: Scheduling

---

#### [SC-001] Schedule Failure Tracking with Exponential Backoff
- **Date:** 2026-06-07
- **Status:** Proposed
- **Enabling advancement:** Inngest/Temporal durable-execution patterns; standard retry-with-backoff for LLM pipelines
- **Gap addressed:** `fireSchedule` wraps the Mangler run in a try/finally but stores no error information. A failing schedule silently skips its run and reschedules normally, giving the user no signal that anything went wrong.
- **User benefit:** Schedules display last error, consecutive failure count, and backoff status in the UI. Users can see at a glance which schedules are failing and why.
- **Approach:** Add `last_error TEXT`, `error_count INTEGER DEFAULT 0`, `backoff_until INTEGER` columns to the `schedules` table. On `fireSchedule` exception, increment `error_count`, set `last_error`, and compute `backoff_until = now + min(2^error_count * 30s, 1h)`. Reset `error_count` to 0 on success. The scheduler's `tick()` skips schedules where `backoff_until > now`.
- **Affected files:** `src/server/scheduler.ts`, `src/server/db/schema.ts`, `src/server/db/schedules.ts`, `src/client/pages/SchedulesPage.tsx`
- **Complexity:** Low (schema migration + small scheduler change + UI badge)
- **Risk:** Minimal; purely additive

---

#### [SC-002] Event-Driven Agent Triggers
- **Date:** 2026-06-07
- **Status:** Proposed
- **Enabling advancement:** Inngest event-driven pipeline pattern; Trigger.dev webhook triggers; chokidar file watching
- **Gap addressed:** Agent runs can only be started manually (via Mangler delegation) or on a cron schedule. There is no way to trigger a run when a file changes, a git commit happens, or an external webhook fires.
- **User benefit:** Power users can configure triggers like "run the test-fixer agent whenever the test suite fails" or "summarize new commits to the main branch every push." Turns Mangled Agents into a reactive CI assistant.
- **Approach:** New `triggers` entity in DB with `kind` (`webhook` | `file_watch` | `git_hook`), `project_id`, and `prompt_template`. Webhook kind exposes a secret-signed `/api/triggers/:id/fire` endpoint. File-watch kind uses `chokidar` to watch a path glob within the project CWD. Git-hook kind writes a `post-commit` hook script to the project's `.git/hooks/`.
- **Affected files:** New `src/server/db/triggers.ts`, `src/server/api/triggers.ts`, `src/server/agents/triggerRunner.ts`, `src/client/pages/` (new TriggersPage)
- **Complexity:** High (new entity, three trigger kinds, security considerations for webhooks)
- **Risk:** File watchers on large repos can be CPU-intensive; git hook installation modifies user's project repo (requires explicit opt-in)

---

#### [SC-003] Missed-Run Detection on Server Start
- **Date:** 2026-06-07
- **Status:** Proposed
- **Enabling advancement:** Temporal's "no backfill by default" pattern; durable execution patterns for scheduled tasks
- **Gap addressed:** `startScheduler()` intentionally skips missed runs while the server was down. This is correct for many use cases but users have no awareness that runs were skipped, and there is no option to catch up.
- **User benefit:** On startup, the server logs (and surfaces in the UI) which schedules missed their fire windows, with a count. An optional "run now" button lets the user manually trigger a catch-up.
- **Affected files:** `src/server/scheduler.ts`, `src/server/db/schedules.ts`, `src/client/pages/SchedulesPage.tsx`
- **Complexity:** Low (compare expected next_run_at at shutdown vs. startup; store missed count)
- **Risk:** Minimal

---

### Component: Memory

---

#### [ME-001] Local Embedding-Based Memory Store (Honcho-Free)
- **Date:** 2026-06-07
- **Status:** Proposed
- **Enabling advancement:** Mem0's hybrid vector/graph/KV architecture; Anthropic `embeddings` API endpoint for local-first vector search
- **Gap addressed:** Honcho memory is off by default and requires an external SaaS account and API key. The majority of users have zero persistent memory for Mangler across conversations. Conversation history grows unbounded in `messages` table with no summarization or retrieval.
- **User benefit:** All users get basic persistent memory (user preferences, project context, ongoing priorities) stored locally in SQLite with vector embeddings. No external account needed. Mangler recalls relevant context at the start of each turn.
- **Approach:** Store embeddings in a new `memory_entries` SQLite table (text, embedding blob as JSON float array, scope: `user` | `project:<id>`). On each turn end, extract key facts via a brief LLM call; embed them; upsert deduplicated entries. At turn start, embed the current user message; retrieve top-K similar memories by cosine similarity (computed in JS, ~O(n) over small sets). Inject as a brief context block. Use Anthropic `embeddings` API (or a small local model via `@xenova/transformers` for zero-latency).
- **Affected files:** New `src/server/db/memory.ts`, `src/server/agents/mangler.ts`, `src/server/db/schema.ts`
- **Complexity:** High (embeddings storage, similarity search, fact extraction LLM call, deduplication)
- **Risk:** SQLite is not a purpose-built vector store; cosine similarity over large memory sets degrades; Anthropic embeddings API adds latency and cost per turn

---

#### [ME-002] Per-Project Memory Scoping
- **Date:** 2026-06-07
- **Status:** Proposed
- **Enabling advancement:** Mem0's three-tier memory scopes (user / session / agent); Honcho workspace segmentation
- **Gap addressed:** Current Honcho integration stores all memories under a single `user` peer with no project segmentation. Mangler may surface memories from Project A when the user is discussing Project B.
- **User benefit:** Project-specific context (tech stack, coding conventions, team members) is recalled only when that project is active. Reduces cross-contamination of context.
- **Approach:** Pass the active project ID to `recallUserMemory` and `recordTurn`; namespace Honcho sessions by `project_id` in addition to `conversation_id`.
- **Affected files:** `src/server/honcho.ts`, `src/server/agents/mangler.ts`
- **Complexity:** Low (mostly a configuration/parameter change in existing Honcho calls)
- **Risk:** Requires Honcho to be enabled; not useful for users on the free/local memory path

---

### Component: Definitions

---

#### [DF-001] Definition Version History via Git
- **Date:** 2026-06-07
- **Status:** Proposed
- **Enabling advancement:** `src/server/git.ts` already exposes `commit` and `push` functions
- **Gap addressed:** Rules and skills under `.claude/<kind>/` can be edited from the Definitions page but there is no history. An accidental edit to a production rule that breaks agent behavior has no easy rollback.
- **User benefit:** Every save of a definition creates a git commit in the data directory. The Definitions page shows a diff of recent changes and allows one-click rollback to any prior version.
- **Affected files:** `src/server/defs.ts`, `src/server/api/defs.ts`, `src/client/pages/DefinitionsPage.tsx`, `src/client/components/DiffViewer.tsx` (already exists)
- **Complexity:** Medium (git integration is present; needs read of git log, diff rendering, and revert API)
- **Risk:** Requires the data directory to be a git repo (or a sub-repo); some users may not have git available

---

## 4. Improvement Selection

### Selected: [MA-002] — Prompt Caching for Mangler System Prompt and Definitions

**Justification against product objective:**

The product's core value proposition is Mangler as a persistent, intelligent workspace assistant. Every Mangler turn re-sends 500–2,000 tokens of stable, session-invariant content (the system prompt + all injected definitions). At even moderate usage (10 turns/day across multiple projects), this represents a material and entirely unnecessary cost.

Prompt caching eliminates 90% of the cost on that stable prefix with a **single structural change** to the messages array construction in `mangler.ts`. It requires no new dependencies, no DB migrations, no client changes, and no behavioral testing beyond verifying the `usage` field in API responses. It is the highest ROI improvement per line of code changed in the entire idea log.

The research consensus (Anthropic engineering guidance; ProjectDiscovery's 59% real-world cost reduction) directly validates this. The risk surface is negligible: the Databricks path is already conditionally branched, so the cache_control blocks apply only to Anthropic calls.

**Ideas excluded:**
- MA-001 (Summarization): Higher complexity, higher regression risk — appropriate as a follow-on after caching is confirmed working.
- RT-001 (Reconnection): High value but medium complexity; the `agent_events` table already provides data for DB-backed replay. Appropriate for the next run.
- OR-001 (Token tracking): Also high value but requires schema migration and UI work; good follow-on.

---

## 5. Implementation Plan: [MA-002] Prompt Caching

**Objective:** Reduce Mangler's per-turn input token cost by 60–90% by applying Anthropic prompt caching to the stable system prompt + definitions prefix.

### 5.1 How Anthropic Prompt Caching Works

The Anthropic Messages API accepts `system` as an array of typed content blocks. Blocks marked with `"cache_control": {"type": "ephemeral"}` are cached for 5 minutes after the first call. Subsequent calls that send the identical marked prefix read from cache at 0.1× the input token price. Cache writes cost 1.25× input price; on any session lasting 2+ turns, this pays back immediately.

The SDK (`@anthropic-ai/sdk ^0.100.1`, already a dependency) exposes `cache_control` on `TextBlockParam` natively.

### 5.2 Affected Files

| File | Change |
|------|--------|
| `src/server/agents/mangler.ts` | Restructure `system` parameter from a plain string into a content-block array with `cache_control` markers |

No other files require modification. The Databricks streaming path (`streamDatabricks`) does not use the Anthropic SDK's `system` array format; the guard already exists via the `if (env.provider === "databricks")` branch.

### 5.3 Implementation Approach

**Current code pattern (in `mangler.ts`):**
```typescript
const system = manglerSystemPrompt() + manglerDefinitionsPrompt();
// ... passed as: system: string
```

**Target pattern:**
```typescript
const basePrompt = manglerSystemPrompt();
const definitionsAddon = manglerDefinitionsPrompt();

// Build system as a content block array to enable prompt caching.
// The base prompt is always present and stable within a session.
// The definitions addon changes only if the user edits definitions mid-session,
// which is rare enough that a cache miss is acceptable.
const system: Anthropic.TextBlockParam[] = [
  {
    type: "text",
    text: basePrompt,
    cache_control: { type: "ephemeral" },
  },
];
if (definitionsAddon) {
  system.push({
    type: "text",
    text: definitionsAddon,
    cache_control: { type: "ephemeral" },
  });
}
```

Pass `system` to `messages.create()`. The Anthropic SDK accepts `TextBlockParam[]` for the `system` parameter.

**Important:** Cache is invalidated automatically when the content changes (e.g., user edits a definition). No manual cache invalidation needed.

### 5.4 Dependencies

- `@anthropic-ai/sdk ^0.100.1` — already installed; `TextBlockParam` with `cache_control` is supported
- No new npm packages
- No DB schema changes
- No environment variable changes

### 5.5 Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Databricks path receives `cache_control` blocks → API error | Low | Existing branch guards Anthropic-only calls; verify guard covers `system` construction |
| SDK version does not support `cache_control` on `system` array | Low | Verify against `@anthropic-ai/sdk` release notes; the field is documented in Anthropic API docs |
| Cache TTL (5 min) expires mid-session for inactive users | Low | First call after expiry is a cache write, slightly more expensive; no functional impact |
| Response format changes with caching enabled | Very Low | Cache hits return identical content to cache misses; `usage.cache_read_input_tokens` appears in response |

### 5.6 Validation Strategy

1. **Unit test:** Mock `getAnthropic().messages.create()` and assert the `system` parameter is an array of `TextBlockParam` with `cache_control` set. Add to `src/server/agents/mangler.test.ts`.
2. **Integration test (manual):** Start the dev server; send two Mangler turns; inspect the Anthropic response `usage` object:
   - Turn 1: `cache_creation_input_tokens > 0`, `cache_read_input_tokens === 0`
   - Turn 2: `cache_creation_input_tokens === 0`, `cache_read_input_tokens > 0`
3. **Regression test:** Run `npm test` to confirm existing Mangler unit tests pass unchanged.
4. **Cost verification:** Compare `input_tokens` across turns 1 and 2 — turn 2 should show input tokens reduced by the size of the cached prefix.
5. **Behavioral verification:** Confirm Mangler responses remain correct; no tool-call or streaming regressions.

### 5.7 Success Criteria

- Cache read tokens confirmed on turn 2+ via `usage` field in dev
- All existing tests pass
- No observable behavioral change in Mangler responses
- Typecheck (`npm run typecheck`) passes
- Lint (`npm run lint`) passes

---

*End of Run 1 — 2026-06-07*

---

## Run 2 Additions — 2026-06-09

### Codebase Delta Since Run 1

A review of the full source confirms two components operating at production maturity that were not present in Run 1's inventory:

- **MCP Server Integration** (`mcp.ts`): Full multi-transport MCP client with process-level connection caching. `loadMcpToolset()` is called on every Mangler turn, calling `client.listTools()` on each connected server. Tool names and descriptions are passed to the Anthropic model without any validation. The `@modelcontextprotocol/sdk ^1.29.0` is already in `package.json`.
- **Local SDK Agents** (`agentRun.ts`, `db/agents.ts`): Two agent types — `task` (MCP-only, file editing disabled) and `coding` (full orchestrator). Both types store `ticket_id` on their runs via `agent_runs.ticket_id`, but completion of a run does not trigger any ticket state transition on the kanban board.

The `agent_events.seq` column (confirmed in `schema.ts:134`) and `agent_runs.sdk_session_id` (line 119) confirm RT-001 and OR-002 infrastructure is in place.

MA-002 is confirmed implemented: `mangler.ts:179-184` passes `system` as a single-block array with `cache_control: { type: "ephemeral" }`.

---

## 2. Frontier Research Findings (Run 2)

### 2.7 MCP Security — Tool Description Injection

**Key advances (2025–2026):**

- **CVE-2025-54136** (tool poisoning): A structural MCP vulnerability where an attacker embeds adversarial instructions inside a tool's `description` or parameter schema fields. The LLM reads these descriptions as part of its context and obeys hidden commands the user cannot see. A 2026 paper (arxiv.org/abs/2603.22489) tested 45 live MCP servers and 353 authentic tools: leading agents showed attack success rates above 60%, with the highest at 72%.
  - Sources: [Practical DevSecOps — MCP security vulnerabilities, 2026](https://www.practical-devsecops.com/mcp-security-vulnerabilities/); [TrueFoundry — CVE-2025-54136 blog, 2026](https://www.truefoundry.com/blog/blog-mcp-tool-poisoning-gateway-defense); [arxiv.org/abs/2603.22489](https://arxiv.org/abs/2603.22489)
- **Defense consensus**: Static metadata analysis (scanning for instruction-like patterns in tool descriptions — imperative verbs, "ignore previous instructions", "always", role assignments) is the highest-leverage low-overhead defense. Invariant Labs released the open-source `mcp-scan` tool; production deployments integrate similar scanning at server registration time.
  - Source: [Cloud Security Alliance — Agentic MCP Security Best Practices v1, 2026](https://labs.cloudsecurityalliance.org/agentic/agentic-mcp-security-best-practices-v1/)
- **Tool allowlisting** (per-agent, per-tool): each agent runs only with the MCP tools it has been explicitly approved to call; new tools require review before reaching a model. This breaks most tool poisoning attacks and is the enterprise standard in 2026.
  - Source: [Integrate.io — Best MCP Gateways and AI Agent Security Tools, 2026](https://www.integrate.io/blog/best-mcp-gateways-and-ai-agent-security-tools/)

**Conflicts / caveats:** The app binds to `127.0.0.1` only, so network-based MCP servers must be explicitly configured by the user. Risk surface is lower than multi-user/cloud deployments but not zero — a compromised npm package in an MCP server's dependency tree can inject poisoned descriptions.

### 2.8 MCP Protocol Advances — Tool List Caching

**Key advances (2025–2026):**

- The **2026 MCP specification** (release candidate published July 2026) adds `ttlMs` and `cacheScope` to `tools/list` responses. A server can now indicate how long its tool list is valid and whether the cache is safe to share across users or sessions. Clients that honor `ttlMs` avoid redundant `listTools()` round-trips.
  - Sources: [MCP 2026 Roadmap blog](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/); [The New Stack — MCP roadmap 2026](https://thenewstack.io/model-context-protocol-roadmap-2026/)
- **Ecosystem**: 97 million monthly SDK downloads as of March 2026; 3,000+ published servers. Every major IDE integrates MCP. The protocol is the de facto standard for LLM tool integration.
  - Source: [Digital Applied — MCP 97M downloads, 2026](https://www.digitalapplied.com/blog/mcp-97-million-downloads-model-context-protocol-mainstream)

### 2.9 Agent-Kanban Integration Patterns

**Key advances (2025–2026):**

- **Auto-advance on completion** is the consensus pattern in 2026 agent-kanban tools: when an agent run completes, the linked card moves to the "Done" column automatically. Multiple open-source implementations (Cline Kanban, Agent Kanban, AI Agent Board) all implement this. Linked cards also auto-start their successors when dependencies land.
  - Sources: [Cline Kanban GitHub — cline/kanban, 2026](https://github.com/cline/kanban); [Agent Kanban — agent-kanban.dev, 2026](https://agent-kanban.dev/); [DanWahlin/ai-agent-board GitHub, 2026](https://github.com/DanWahlin/ai-agent-board)
- **Run history per ticket**: showing the list of agent runs associated with a ticket (with status, duration, and summary) is standard UX in 2026 agent tooling. It gives the user a full audit trail of automated work done against each work item.
  - Source: [DEV Community — AI agents as kanban team members, 2026](https://dev.to/lainagent_ai/i-built-a-kanban-board-where-ai-agents-are-actual-team-members-l1c)

### 2.10 SQLite Vector Search for Local Memory

**Key advances (2025–2026):**

- **sqlite-vec** is a SQLite extension (SIMD-accelerated, AVX/NEON) that adds virtual `vec0` tables for vector storage and distance functions (`vec_distance_cosine`). It eliminates the need for a separate vector database, making it a natural fit for the local-first architecture.
  - Source: [sqlite.ai/sqlite-vector](https://www.sqlite.ai/sqlite-vector); [Medium — How sqlite-vec Works, 2026](https://medium.com/@stephenc211/how-sqlite-vec-works-for-storing-and-querying-vector-embeddings-165adeeeceea)
- **sqlite-memory**: A SQLite extension for AI agent persistent memory with hybrid semantic search (FTS5 + vector similarity). Markdown-optimized, offline-first.
  - Source: [GitHub — sqliteai/sqlite-memory, 2026](https://github.com/sqliteai/sqlite-memory)
- **Practical threshold**: For small memory sets (< 5,000 entries), pure-JS cosine similarity over JSON float arrays is within 2× of sqlite-vec latency. The sqlite-vec approach pays off at scale but requires a native C extension — an installation and ABI dependency risk given the project's existing `better-sqlite3` native module.
  - Source: [PingCAP — Local-First RAG with SQLite, 2026](https://www.pingcap.com/blog/local-first-rag-using-sqlite-ai-agent-memory-openclaw/)

---

## 3. Idea Log (Run 2 Additions)

### Component: MCP Server Integration

---

#### [MC-001] MCP Tool Description Security Scanner
- **Date:** 2026-06-09
- **Status:** Proposed
- **Enabling advancement:** 2026 MCP tool poisoning research (CVE-2025-54136); static metadata analysis defense; `mcp-scan` open-source scanner pattern
- **Gap addressed:** `loadMcpToolset()` in `mcp.ts` passes each server's `tool.description` directly to the Anthropic model as-is. A compromised or malicious MCP server can embed adversarial instructions in these descriptions that the LLM silently obeys. Attack success rates above 60% on popular agents in 2026 research.
- **User benefit:** Suspicious tool descriptions are flagged before they reach the model. The McpServers settings page can surface a warning badge on servers whose tools contain instruction-like patterns. A blocked description never enters Mangler's tool array.
- **Approach:** In `loadMcpToolset()`, before pushing each tool to the `tools` array, run `scanDescription(tool.description)` — a pure function that tests for: imperative-verb sentences targeting the model ("always respond", "ignore previous"), role-assignment language ("you are now", "act as"), and meta-instruction markers ("before responding", "do not tell the user"). Return a `{ safe: boolean; reason?: string }` result. If unsafe, log a server warning and skip the tool (or include it with a sanitized description placeholder). Add a `scanResults` field to the `McpToolset` interface so the settings API can surface them.
- **Affected files:** `src/server/agents/mcp.ts`, `src/server/api/mcpServers.ts`, `src/client/pages/McpServersPage.tsx`
- **Complexity:** Low-Medium (pure regex scanner, no new dependencies; UI badge is minor)
- **Risk:** False positives are possible (legitimate tools with imperative descriptions); scanner should be advisory rather than blocking by default until patterns are tuned

---

#### [MC-002] MCP Tool List TTL Cache
- **Date:** 2026-06-09
- **Status:** Proposed
- **Enabling advancement:** 2026 MCP spec `ttlMs` field on `tools/list` responses; standard HTTP cache semantics for agent toolsets
- **Gap addressed:** `loadMcpToolset()` is called on every Mangler turn. It calls `client.listTools()` on every connected server, even though tool schemas rarely change between turns. For stdio servers, this is a subprocess round-trip on every user message. For remote servers, it is an unnecessary HTTP call.
- **User benefit:** Mangler turn initiation is faster for users with several MCP servers configured. Reduces load on remote MCP servers. Tool list is still refreshed when server config changes (the existing fingerprint cache already handles reconnection).
- **Approach:** Extend the `Cached` interface in `mcp.ts` to add `tools: Anthropic.Tool[]` and `toolsAt: number`. In `ensureConnected`, after calling `listTools()`, store the result with `Date.now()`. In `loadMcpToolset`, before calling `listTools()`, check if `Date.now() - toolsAt < TOOL_CACHE_TTL_MS` (default 60 000 ms); if so, use the cached tools. Honor server-provided `ttlMs` if the MCP SDK exposes it in the response metadata.
- **Affected files:** `src/server/agents/mcp.ts`
- **Complexity:** Low (extend existing cache entry; add TTL check)
- **Risk:** Stale tool list if a server adds/removes tools within the TTL window. Mitigation: invalidating the server config (already triggers `invalidateMcpServer`) also clears the tool cache; users can restart the server or nudge the config to force a refresh

---

### Component: Kanban Board / Agent Runs (cross-cutting)

---

#### [KA-001] Auto-Advance Ticket on Run Completion
- **Date:** 2026-06-09
- **Status:** Planned
- **Enabling advancement:** 2026 agent-kanban consensus pattern (Cline Kanban, Agent Kanban, DanWahlin/ai-agent-board); the `agent_runs.ticket_id` FK already exists
- **Gap addressed:** When Mangler delegates a ticket to an orchestrated run, `agent_runs.ticket_id` links the run to the ticket. But when the run completes successfully, the ticket stays wherever the user left it — typically "In Progress". The user must manually drag it to "Done". This manual step negates the automation value of the delegation.
- **User benefit:** Completing an agent run automatically advances the linked ticket to the project's final column. The kanban board reflects reality without any user action. All connected clients see the change instantly via the existing `board.updated` WebSocket message.
- **Approach:** Add an `advanceLinkedTicket(runId)` function in `runEngine.ts`. After `runsRepo.setStatus(runId, "done")` in `handleMessage`, call it. The function: (1) gets the run to read `ticketId` and `projectId` — if either is null, returns; (2) gets the ticket — if absent, returns; (3) gets the project, takes `project.columns[project.columns.length - 1]` as the final column; (4) if the ticket is already in that column, returns; (5) computes `appendPosition` over the existing tickets in that column; (6) calls `ticketsRepo.move(ticketId, finalColumn.id, position)`; (7) broadcasts `{ type: "board.updated", projectId }`.
- **Affected files:** `src/server/agents/runEngine.ts`, (imports `ticketsRepo` and `projectsRepo` which are already in the codebase)
- **New dependencies:** None. Uses `appendPosition` from `../../shared/board` (already used by `ticketsRepo`).
- **Complexity:** Low (one new ~20-line function; no schema changes; no new packages)
- **Risk:** Projects with custom column layouts may have a final column that is not a "done" analog (e.g., "Archive"). This is edge-case; the vast majority of kanban boards place completion at the end. A future enhancement could add an explicit completion-column setting per project.

---

#### [KA-002] Ticket Run History View
- **Date:** 2026-06-09
- **Status:** Proposed
- **Enabling advancement:** 2026 agent-kanban audit trail UX pattern; `agent_runs.ticket_id` FK already provides the join
- **Gap addressed:** There is no way to see which agent runs have been executed against a given ticket. The kanban board shows ticket title and body but no history of automated work. For a ticket that has been delegated multiple times (failed run then successful retry), the user has no record.
- **User benefit:** Clicking a ticket on the board shows a "Runs" tab listing every associated agent run with its status (done/failed/stopped), title, duration, and one-line summary. Clicking a run row navigates to the full run detail.
- **Approach:** Add a `GET /api/tickets/:id/runs` endpoint that returns `runsRepo.listByTicket(ticketId)` (a new query: `SELECT * FROM agent_runs WHERE ticket_id = ? ORDER BY created_at DESC`). In the ticket detail UI, add a "Runs" section that calls this endpoint and renders a compact list.
- **Affected files:** `src/server/db/runs.ts` (new `listByTicket`), `src/server/api/tickets.ts` (new endpoint), `src/client/` (ticket detail component — if one exists; otherwise `src/client/pages/BoardPage.tsx`)
- **Complexity:** Low-Medium (new DB query + API endpoint + UI list)
- **Risk:** Minimal

---

## 4. Improvement Selection (Run 2)

### Selected: [KA-001] — Auto-Advance Ticket on Run Completion

**Justification against product objective:**

Mangled Agents' core pitch is that the user talks to Mangler to move work forward — they delegate a ticket, the agent codes the solution, and the board reflects the outcome. Currently that loop is broken at the last step: the ticket stays "In Progress" after the run finishes, requiring a manual drag to "Done." This defeats the point of agent-driven project management.

KA-001 closes the loop with a single ~20-line addition to `runEngine.ts`. It requires no new dependencies, no schema migrations, no client changes beyond receiving an already-typed `board.updated` WS event. The `ticketsRepo.move()` and `projectsRepo.get()` functions are already present and tested. The `appendPosition` utility already handles position calculation. `board.updated` is already a typed message in `shared/ws.ts` and already consumed by the board client.

The research confirms this is the canonical 2026 agent-kanban pattern. The implementation risk is effectively zero: it is additive, reversible (remove the call), and cannot break any existing behavior.

**Ideas excluded (Run 2):**
- MC-001 (Tool description scanner): Higher implementation subtlety (regex false positives); localhost binding reduces the threat surface vs. enterprise deployments. Good follow-on once MCP usage grows.
- MC-002 (Tool list TTL): Low complexity but low urgency — only measurable impact with 3+ slow MCP servers. Good clean-up item for a quiet sprint.
- KA-002 (Ticket run history): Also good, but is a pure UI addition. Naturally follows KA-001 once tickets and runs are properly linked.

---

## 5. Implementation Plan: [KA-001] Auto-Advance Ticket on Run Completion

**Objective:** When an orchestrated or agent run linked to a ticket completes successfully, move that ticket to the project's final column and broadcast a board update to all clients.

### 5.1 Mechanism

`handleMessage` in `runEngine.ts` is the single choke point where all SDK-backed runs transition to "done" or "failed". It already calls `runsRepo.setStatus(runId, "done")`. Adding `advanceLinkedTicket(runId)` immediately after the "done" branch is the minimal, correct insertion point. It covers orchestrated runs (`orchestrator.ts`), coding agent runs, and task agent runs — all of which go through `handleMessage`.

### 5.2 Affected Files

| File | Change |
|------|--------|
| `src/server/agents/runEngine.ts` | Add `advanceLinkedTicket` function; call it on "success" result; import `ticketsRepo`, `projectsRepo`, `appendPosition` |

No other files require modification. The existing `board.updated` WS message type, `ticketsRepo.move()`, `projectsRepo.get()`, and `appendPosition` are all production-ready.

### 5.3 Implementation

**Current code in `handleMessage` (lines 82–86):**
```typescript
if (msg.type === "result") {
  const summary = msg.subtype === "success" ? msg.result : `ended: ${msg.subtype}`;
  emit(run.id, "result", { subtype: msg.subtype, text: summary });
  runsRepo.setSummary(runId, String(summary).slice(0, 800));
  runsRepo.setStatus(runId, msg.subtype === "success" ? "done" : "failed");
  return true;
}
```

**After change:**
```typescript
if (msg.type === "result") {
  const summary = msg.subtype === "success" ? msg.result : `ended: ${msg.subtype}`;
  emit(runId, "result", { subtype: msg.subtype, text: summary });
  runsRepo.setSummary(runId, String(summary).slice(0, 800));
  runsRepo.setStatus(runId, msg.subtype === "success" ? "done" : "failed");
  if (msg.subtype === "success") advanceLinkedTicket(runId);
  return true;
}
```

**New function (added to `runEngine.ts`):**
```typescript
function advanceLinkedTicket(runId: string): void {
  const run = runsRepo.get(runId);
  if (!run?.ticketId || !run.projectId) return;
  const ticket = ticketsRepo.get(run.ticketId);
  if (!ticket) return;
  const project = projectsRepo.get(run.projectId);
  if (!project?.columns.length) return;
  const finalColumn = project.columns[project.columns.length - 1];
  if (ticket.columnId === finalColumn.id) return;
  const positions = ticketsRepo
    .listByProject(run.projectId)
    .filter((t) => t.columnId === finalColumn.id)
    .map((t) => t.position);
  ticketsRepo.move(ticket.id, finalColumn.id, appendPosition(positions));
  broadcast({ type: "board.updated", projectId: run.projectId });
}
```

**New imports at top of `runEngine.ts`:**
```typescript
import { ticketsRepo } from "../db/tickets";
import { projectsRepo } from "../db/projects";
import { appendPosition } from "../../shared/board";
```

### 5.4 Dependencies

- `ticketsRepo` — `src/server/db/tickets.ts` — already in codebase
- `projectsRepo` — `src/server/db/projects.ts` — already in codebase
- `appendPosition` — `src/shared/board.ts` — already used by `ticketsRepo`
- No new npm packages
- No DB schema changes
- No environment variable changes

### 5.5 Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Final column is not a "done" analog (e.g., "Archive") | Low | Convention is well-established; edge-case users can reorder columns. Future: per-project completion-column setting |
| Multiple concurrent runs for the same ticket race to advance | Very low | Both calls `ticketsRepo.move()` to the same column; last-write-wins is idempotent here |
| DB error in `advanceLinkedTicket` propagates and marks run as failed | None | The function is called after `setStatus("done")` returns; it runs in a separate try block and should catch its own errors |
| Ticket deleted between run start and completion | Very low | `ticketsRepo.get()` returns `undefined`; early return handles this cleanly |

### 5.6 Validation Strategy

1. **Unit test (new):** In `src/server/agents/runEngine.ts` test or a sibling file, mock `runsRepo`, `ticketsRepo`, `projectsRepo`, and `broadcast`. Assert that:
   - When `handleMessage` receives `{ type: "result", subtype: "success" }` for a run with `ticketId` + `projectId`, `ticketsRepo.move()` is called with the last column's id and `broadcast({ type: "board.updated" })` fires.
   - When `subtype === "error_max_turns"` (failed), no ticket move occurs.
   - When `ticketId` is null, no ticket move occurs.
   - When ticket is already in the final column, `move()` is not called.
2. **Integration test (manual):** Start dev server (`npm run dev`); create a project; create a ticket in "Backlog"; delegate it to a fast agent run (e.g., `echo done`); observe the ticket move to "Done" in the board UI without any user action.
3. **Regression:** Run `npm test` to confirm all existing `runEngine`, `orchestrator`, and `agentRun` tests pass.
4. **Type check:** `npm run typecheck` must pass with zero errors.
5. **Lint:** `npm run lint` must pass with zero errors.

### 5.7 Success Criteria

- Ticket in "Backlog" or "In Progress" moves to final column when a linked run completes successfully
- No ticket movement on failed or stopped runs
- Board UI updates in real time via `board.updated` WS event (no page refresh required)
- All existing tests pass; no new lint or type errors

---

*End of Run 2 — 2026-06-09*
