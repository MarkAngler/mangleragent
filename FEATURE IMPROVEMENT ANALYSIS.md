# FEATURE IMPROVEMENT ANALYSIS

> **Persistent ledger for nightly improvement runs.**
> Never delete prior entries. Append new ideas under their component, using the stable ID format below.
> Status values: `Proposed` | `Planned` | `Done`

---

## Run Log

| Run | Date | Ideas Added | Idea Selected |
|-----|------|-------------|---------------|
| 1 | 2026-06-07 | MA-001, MA-002, MA-003, OR-001, OR-002, OR-003, RT-001, SC-001, SC-002, SC-003, ME-001, ME-002, DF-001 | MA-002 |
| 2 | 2026-06-08 | KB-001, ME-003, OR-004, OR-005, OR-006 | KB-001 |

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

## Run 2 — 2026-06-08

---

### Frontier Research: New Sections (Run 2)

#### 2.7 Agent-Driven Project Management (Kanban + AI Agents)

**Key advances (2025–2026):**

- **Convergent industry pattern:** Multiple independent projects (agent-kanban, Vibe Kanban, ai-agent-board, KittyClaw) have all arrived at the same architecture: ticket/card state change → agent spawn with card text as context → agent updates card state on completion. This is now considered table-stakes behavior for agent-native project management tools.
  - Sources: [agent-kanban — saltbo/agent-kanban](https://github.com/saltbo/agent-kanban); [Vibe Kanban — BloopAI](https://github.com/BloopAI/vibe-kanban); [ai-agent-board — DanWahlin](https://github.com/DanWahlin/ai-agent-board); [KittyClaw — DEV Community](https://dev.to/lainagent_ai/i-built-a-kanban-board-where-ai-agents-are-actual-team-members-l1c)

- **agent-kanban** (TypeScript + Hono + D1/SQLite + SSE) defines a task lifecycle: **Todo → In Progress → In Review → Done**. Atomic batch operations prevent race conditions when multiple agents attempt to claim the same card simultaneously. Agents have Ed25519 keypair identities, CLI verbs (`ak task claim`, `ak task complete`, `ak task reject`), and stale detection (Offline after 2 hours of inactivity).
  - Source: [github.com/saltbo/agent-kanban](https://github.com/saltbo/agent-kanban)

- **ai-agent-board** normalizes events from Claude Code, Codex, Gemini CLI, and others into a common `AgentEvent` format; WebSocket broadcast drives the live board; optional per-task git worktree isolation auto-creates and auto-cleans branches. The `AgentProvider` abstraction pattern (description, systemPrompt, toolset per agent type) is used to parameterize delegation.
  - Source: [github.com/DanWahlin/ai-agent-board](https://github.com/DanWahlin/ai-agent-board)

- **KittyClaw:** Declarative automations fire when a card enters specific columns. When a ticket moves to "Done," a `committer-on-done` automation commits the changes. When it moves to "Review," `qa-on-review` spawns a QA agent. Automations are the primary integration point, not direct agent-to-board API calls.
  - Source: [DEV Community — KittyClaw](https://dev.to/lainagent_ai/i-built-a-kanban-board-where-ai-agents-are-actual-team-members-l1c)

**Conflicts / caveats:** Both column-transition and label-based approaches are used in the wild. Column transitions are more visually prominent but presume fixed column semantics ("In Progress," "Done"). Label badges are more conservative and composable — they add status without overriding user-managed column placement.

---

#### 2.8 SQLite-vec for Embedded Vector Search in Node.js

**Key advances (2025–2026):**

- **sqlite-vec** (`npm install sqlite-vec`) by Alex Garcia is now the canonical SQLite vector extension. Its predecessor `sqlite-vss` (Faiss-based) is deprecated. The `sqliteVec.load(db)` call is explicitly documented as compatible with `better-sqlite3`, which this project already uses.
  - Sources: [github.com/asg017/sqlite-vec](https://github.com/asg017/sqlite-vec); [Official Node.js guide — Alex Garcia](https://alexgarcia.xyz/sqlite-vec/js.html)

- **Recent releases:** v0.1.7 (March 17, 2026) — proper DELETE support, Mozilla-backed revival; v0.1.9 (March 31, 2026) — bug fixes for vec0 tables with long metadata; v0.1.10-alpha.4 (May 18, 2026) — experimental DiskANN and IVF approximate-nearest-neighbor indexes. **7,700 GitHub stars, 322 forks** as of June 2026.
  - Source: [sqlite-vec GitHub releases](https://github.com/asg017/sqlite-vec/releases)

- **KNN query pattern:** Vectors are stored as `Float32Array.buffer`. The canonical query is `WHERE embedding MATCH ? ORDER BY distance LIMIT K`, which is O(K·n) brute-force in v0.1.x but will improve with DiskANN in v1.0+.
  - Source: [DEV Community — How sqlite-vec Works](https://dev.to/stephenc222/how-to-use-sqlite-vec-to-store-and-query-vector-embeddings-58mf)

- **Local embedding generation:** The `@xenova/transformers` package (now `@huggingface/transformers`) runs ONNX embedding models in Node.js without any API call; the `Xenova/gte-base` model (768-dim) performs well for semantic retrieval with negligible latency on CPU.
  - Source: [github.com/asg017/sqlite-vec — js example](https://alexgarcia.xyz/sqlite-vec/js.html)

- **Alternative packages:** `@dao-xyz/sqlite3-vec` (browser WASM + Node.js); `@photostructure/sqlite-vec`; `@sqliteai/sqlite-vector` (cross-platform, 30 MB memory cap). These are wrappers or alternatives rather than replacements for the core sqlite-vec extension.
  - Source: [npmjs.com/@photostructure/sqlite-vec](https://www.npmjs.com/package/@photostructure/sqlite-vec)

**Conflicts / caveats:** sqlite-vec is explicitly pre-v1.0. The ANN indexes (DiskANN, IVF) are experimental as of v0.1.10-alpha. For small memory sets (<5,000 entries) the brute-force KNN is fast enough. **Pin to a specific patch version** (`sqlite-vec@0.1.9`) in `package.json` until v1.0 is released.

---

#### 2.9 Structured LLM Plan Critique and Agent Self-Reflection

**Key advances (2025–2026):**

- **AFLOW** (arXiv:2410.10762, ICLR 2025 **oral** presentation): Treats `Review` and `Revise` as first-class MCTS primitive operators over a workflow space. Discovered that inserting reflection steps allows weaker models to outperform stronger ones on the cost-efficiency Pareto front. Outperforms manual workflows by 5.7%, prior automated methods by 19.5% across six benchmarks.
  - Source: [arXiv:2410.10762](https://arxiv.org/abs/2410.10762); [ICLR 2025](https://iclr.cc/virtual/2025/oral/31731)

- **LangGraph self-correction pattern** (production standard as of 2025): `generate_node → critique_node → router_node → (accept | retry)` using a conditional edge. The router reads a boolean from the critic's **structured JSON output**. A `max_retries` guard is essential to prevent infinite loops. Using a smaller/cheaper model for the `critique_node` is the standard cost tradeoff.
  - Source: [Zylos Research — Agent Self-Correction](https://zylos.ai/research/2026-03-06-ai-agent-reflection-self-evaluation-patterns); [ActiveWizards — LangGraph Self-Correcting Agents](https://activewizards.com/blog/a-deep-dive-into-langgraph-for-self-correcting-ai-agents/)

- **Structured critique output schema** (emerging practice, 2025–2026): Rather than free-text "REVISE: ..." feedback, critics return a typed structure: `{ decision: "approve" | "reject", confidence: 0–1, issues: Array<{ excerpt: string, problem: string, suggestion: string }> }`. This is actionable by both the agent (for targeted revision) and the UI (for rendering specific feedback).
  - Source: [SitePoint — Agentic Design Patterns 2026](https://www.sitepoint.com/the-definitive-guide-to-agentic-design-patterns-in-2026/)

- **Benchmark:** Agents with critique-and-revise loops reached 91% accuracy on coding benchmarks vs. 80% without reflection. Self-refinement improved performance by ~20% across diverse tasks (dialogue, math).
  - Source: [Zylos Research](https://zylos.ai/research/2026-03-06-ai-agent-reflection-self-evaluation-patterns)

**Conflicts / caveats:** Pre-execution plan critique (deliberative planning) adds latency before every run. For short runs (<5 turns), the critique overhead may exceed the benefit. Gating deliberative critique on `approver === "agent"` or on run complexity is the correct tradeoff.

---

#### 2.10 Claude Agent SDK Subagent API and Streaming Events

**Key advances (2025–2026):**

- **Programmatic subagent definition** via the `agents` parameter in `query()` options (TypeScript SDK, 2025–2026). Each entry is an `AgentDefinition` with: `description` (auto-dispatch signal), `prompt` (system prompt), `tools` (allowlist), `model`, `background` (boolean — non-blocking), `maxTurns`, `permissionMode`. The `Agent` tool was renamed from `Task` in Claude Code v2.1.63; both names should be checked for compatibility.
  - Source: [code.claude.com/docs/en/agent-sdk/subagents](https://code.claude.com/docs/en/agent-sdk/subagents)

- **Subagent constraints:** Subagents cannot spawn their own subagents — `Agent` must not appear in a subagent's `tools` array. Context from parent to subagent is passed **only** via the Agent tool's prompt string (no shared conversation history). Only the subagent's final message returns to the parent. Parallelism: up to 10 concurrent sub-agents; wall time equals the slowest, not the sum.
  - Source: [code.claude.com/docs/en/agent-sdk/subagents](https://code.claude.com/docs/en/agent-sdk/subagents)

- **Streaming via `includePartialMessages: true`:** The async generator yields typed streaming events: `content_block_start` (tool name known immediately), `content_block_delta` with `delta.type === "input_json_delta"` (partial JSON input chunks), `content_block_stop` (tool input complete). This enables displaying tool names to the user before tool execution begins — a significant UX improvement for long-running orchestrated runs.
  - Source: [code.claude.com/docs/en/agent-sdk/streaming-output](https://code.claude.com/docs/en/agent-sdk/streaming-output)

- **Background subagents:** `background: true` in an `AgentDefinition` allows the parent agent to dispatch and continue without blocking on the subagent's result. The result is collected asynchronously when the subagent's `Agent` tool call resolves.
  - Source: [Claude Agent SDK subagents docs](https://code.claude.com/docs/en/agent-sdk/subagents)

**Conflicts / caveats:** Parallel fan-out via the SDK is currently limited to 10 concurrent subagents. The `cwd` option behavior in subagent definitions vs. the root `query()` `cwd` option requires verification against the current SDK version (`@anthropic-ai/claude-agent-sdk@0.3.158`).

---

### Idea Log Additions (Run 2)

---

### Component: Kanban Board

---

#### [KB-001] Ticket Agent-Status Labels on Run Lifecycle
- **Date:** 2026-06-08
- **Status:** Planned
- **Enabling advancement:** Industry-standard pattern converged across agent-kanban, Vibe Kanban, ai-agent-board, and KittyClaw: ticket state is automatically updated to reflect agent lifecycle. Label-based approach chosen over column transitions to avoid hardcoding column-name semantics.
- **Gap addressed:** When `delegate_ticket` creates a run, the ticket's labels remain unchanged. The kanban board provides no visual indication that an agent is working on the ticket. Users must navigate to the Runs page to discover run state. This severs the conceptual link between the project management view and the agent execution view — exactly the link that makes agent-native boards valuable.
- **User benefit:** The kanban board becomes a live status board. An `agent:running` badge appears on the ticket card the moment delegation fires. On run completion it is replaced by `agent:done`, `agent:failed`, or `agent:stopped`. No page navigation required; the board view is the source of truth.
- **Research support:** Every surveyed agent-kanban project (agent-kanban, Vibe Kanban, ai-agent-board, KittyClaw) implements automatic ticket/card state updates driven by agent run lifecycle events as a core feature. The label approach is used in agent-kanban's status column; the lifecycle events (claim → working → done/failed) are universal.
- **Affected files:** `src/server/agents/manglerTools.ts`, `src/server/agents/orchestrator.ts`
- **Complexity:** Low — both files already import `ticketsRepo` and `broadcast`; no schema changes; no new dependencies; no client changes (labels render as visible badges on ticket cards already)
- **Risk:** Minimal. Label updates are idempotent: existing `agent:*` labels are filtered before each write, preventing accumulation across re-delegations. The `finally`-block update skips tickets whose runs were already handled by `stopOrchestratedRun` (status check guards against double-write).

---

### Component: Memory (additions)

---

#### [ME-003] sqlite-vec Integration for Scalable Local Vector Memory
- **Date:** 2026-06-08
- **Status:** Proposed
- **Enabling advancement:** sqlite-vec v0.1.9 (March 31, 2026); `sqliteVec.load(db)` explicitly compatible with `better-sqlite3`; KNN query via `WHERE embedding MATCH ? ORDER BY distance LIMIT K` replaces O(n) JS cosine loop
- **Gap addressed:** ME-001 proposes O(n) cosine similarity computed in JavaScript, which degrades as the memory store grows. sqlite-vec provides a proper indexed KNN query within SQLite using the same `better-sqlite3` connection the project already holds. No external vector database needed.
- **User benefit:** ME-001's local memory remains fast at thousands of entries; no API latency for embedding retrieval. Entirely local — works offline. Pins at 7.7k-star, actively-maintained package.
- **Approach:** `npm install sqlite-vec@0.1.9`; in `src/server/db/index.ts`, call `sqliteVec.load(db)` after opening the database; create a `vec_memory_entries` virtual table (`vec0`) alongside the regular `memory_entries` metadata table; replace the planned JS cosine loop in ME-001 with `WHERE embedding MATCH ? ORDER BY distance LIMIT 5`.
- **Affected files:** `src/server/db/index.ts`, new `src/server/db/memory.ts` (shared with ME-001)
- **Complexity:** Low — 2-line change to DB initialization + schema addition; main complexity is in ME-001 itself
- **Risk:** sqlite-vec is pre-v1.0; pin to exact patch version. DiskANN / ANN indexes (experimental in v0.1.10-alpha) are not required — brute-force KNN is sufficient for <5,000 memory entries. Must be gated: if `sqliteVec.load` throws (missing native module), fall back to JS cosine loop with a warning.

---

### Component: Orchestrated Agent Runs (additions)

---

#### [OR-004] Per-Run Wall-Clock Timeout
- **Date:** 2026-06-08
- **Status:** Proposed
- **Enabling advancement:** Standard JS `setTimeout` + existing `stopOrchestratedRun`; consistent with Inngest/Temporal step-timeout patterns for LLM pipelines
- **Gap addressed:** The orchestrator has `MAX_TURNS = 60` but no wall-clock timeout. A run blocked by a hanging Bash command, model API timeout, or network partition holds an `activeQueries` slot indefinitely with no recovery path short of server restart. This is an unhandled production failure mode.
- **User benefit:** Runs that exceed a configurable wall-clock limit (default: 30 min) are cleanly stopped with status "failed" and a descriptive event logged. Users see "Run timed out after 30 minutes" in the event log rather than a perpetually-spinning progress indicator.
- **Approach:** In `startOrchestratedRun`, start a `setTimeout` immediately after `activeQueries.set(run.id, q)`. On expiry, emit an `error` event and call `stopOrchestratedRun(run.id)`. Clear the timeout in the `finally` block unconditionally. Initial implementation uses a module-level `DEFAULT_RUN_TIMEOUT_MS = 30 * 60 * 1000` constant; a future iteration can read it from a `timeout_ms` column on `agent_runs`.
- **Affected files:** `src/server/agents/orchestrator.ts`
- **Complexity:** Low — ~10 lines; no schema changes in initial version
- **Risk:** If the model API is slow-but-valid (large output generation), a short timeout causes false positives. 30 min default is conservative. The risk of missing this timeout (zombie runs) outweighs the risk of false positives.

---

#### [OR-005] Structured JSON Plan Critique
- **Date:** 2026-06-08
- **Status:** Proposed
- **Enabling advancement:** LangGraph generate→critique→route production pattern (2025); AFLOW Review+Revise MCTS operators (ICLR 2025 oral); Anthropic structured output (JSON schema mode) in `@anthropic-ai/sdk`
- **Gap addressed:** `reviewPlan` uses a regex on free-text output (`/^approve/i`). The critic cannot report which parts of the plan fail, cannot assign confidence, and cannot distinguish "wrong approach" from "minor detail." On any API failure, it silently auto-approves. The approval UI receives only a raw string reason.
- **User benefit:** Plan rejections include structured feedback: which excerpt in the plan is problematic, what the problem is, and a concrete suggestion. The approval UI renders this as actionable line-level guidance. Revision history (how many iterations were needed) becomes trackable via the `reason` field.
- **Approach:** Change `reviewPlan` to use `response_format` / JSON schema forcing in `messages.create`. Target schema: `{ decision: "approve"|"reject", confidence: number, issues: Array<{ excerpt: string, problem: string, suggestion: string }> }`. Parse JSON; derive `approved` from `decision`. On parse failure, fall back to the current APPROVE/REVISE text heuristic rather than auto-approving. Store the full critique JSON in `permission_requests.reason`. Render structured issues in `OrchestratedRunView.tsx` when `kind === "plan"` and `reason` is valid JSON.
- **Affected files:** `src/server/agents/orchestrator.ts`, `src/client/components/OrchestratedRunView.tsx`
- **Complexity:** Medium — structured output support must be verified against `@anthropic-ai/sdk@0.100.1`; UI changes required for the new critique format
- **Risk:** Anthropic JSON schema mode may add latency vs. the current text-parsing approach. Parsing failures must gracefully degrade to the existing behavior. The client must handle both the old string format and the new JSON format in `reason` (transition period).

---

#### [OR-006] Claude Agent SDK Subagent Fan-Out for Parallel Ticket Delegation
- **Date:** 2026-06-08
- **Status:** Proposed
- **Enabling advancement:** Claude Agent SDK `agents` parameter in `query()` options (2025); parallel subagent execution up to 10 concurrent; `background: true` for non-blocking dispatch; subagent SDK docs confirmed via code.claude.com
- **Gap addressed:** Delegating multiple tickets is sequential — Mangler calls `delegate_ticket` once per ticket, each creating an independent `query()` call. The Agent SDK's `agents` + `background: true` pattern enables true concurrent execution within a single `query()` session. Wall time becomes max(tickets) rather than sum(tickets).
- **User benefit:** "Delegate all open bugs to agents" runs all agents concurrently. A 4-ticket parallel delegation that each takes 5 min completes in 5 min instead of 20.
- **Approach:** New `startParallelOrchestratedRun` function accepting `Array<{ run: AgentRun; prompt: string }>`. Constructs a parent `query()` with `agents` entries for each run (description from ticket title, prompt = delegated prompt, tools restricted, `background: true`). Dispatches the parent query and maps streaming results back to the correct `runId` via the Agent tool's `tool_use_id`. Each sub-agent's events flow through the existing `eventsRepo.add` path.
- **Affected files:** `src/server/agents/orchestrator.ts`, `src/server/agents/manglerTools.ts`
- **Complexity:** High — SDK subagent API constraints (no sub-subagents; context only via prompt string; `cwd` handling per subagent requires verification); event demultiplexing from parent to child runs; significant testing surface
- **Risk:** High. The `cwd` option behavior per subagent definition vs. root `query()` `cwd` is undocumented and requires empirical testing. If subagents inherit the parent's CWD rather than accepting per-agent CWD, multi-project fan-out breaks. Defer to a later run after OR-002 (session resume) is validated.

---

## 4. Improvement Selection — Run 2

### Selected: [KB-001] — Ticket Agent-Status Labels on Run Lifecycle

**Justification against product objective:**

Mangled Agents' core promise is that Mangler helps the user "stay organized and move work forward." The kanban board is the primary organizational artifact — it is the user's real-time view of what is happening. Yet today, delegating a ticket to an agent produces zero change on the board. The ticket sits in its original column with its original labels while an agent is actively transforming the project. Users must open a separate Runs page to observe progress.

Every surveyed agent-kanban product (agent-kanban, Vibe Kanban, ai-agent-board, KittyClaw) treats automatic ticket state updates as a first-class feature, not an enhancement. It is the behavioral definition of an "agent-native" board. Implementing KB-001 closes this gap with the minimum possible implementation surface — **two files, no new dependencies, no schema changes** — and the effect is immediately visible to any user who delegates a ticket.

The label approach (rather than automatic column transitions) is the correct conservative choice: it does not presume any fixed column names or ordering, it composes with user-managed column placement, and it is trivially reversible (the `agent:*` prefix is a clear namespace, easy to filter).

**Ideas excluded:**
- ME-003 (sqlite-vec): High value but depends on ME-001 being implemented first; ME-001 is not yet Planned. Correct sequencing: ME-001 → ME-003.
- OR-004 (Wall-Clock Timeout): Also low complexity and high safety value, but ranks below KB-001 on user-facing impact. Good candidate for Run 3.
- OR-005 (Structured Critique): Medium complexity; blocks on verifying structured output support in the current Anthropic SDK version. Best as a follow-on after OR-001 (token tracking) validates the observability layer.
- OR-006 (Parallel Fan-Out): High complexity, high risk, unverified SDK behavior. Defer until OR-002 (session resume) is validated.

---

## 5. Implementation Plan: [KB-001] Ticket Agent-Status Labels

**Objective:** Automatically label tickets with `agent:running`, `agent:done`, `agent:failed`, or `agent:stopped` at the corresponding orchestrated run lifecycle event, broadcasting a `board.updated` event so the kanban board reflects agent state in real time.

### 5.1 How Labels Work in This Codebase

Tickets have a `labels_json TEXT NOT NULL DEFAULT '[]'` column in SQLite, surfaced as `string[]` on the `Ticket` type. `ticketsRepo.update(ticketId, { labels: string[] })` does a full array replacement. The `board.updated` WebSocket message triggers a client refetch of the board for the given `projectId`, causing the ticket card to re-render with the new labels.

All `agent:*` labels share a namespaced prefix, making them easy to filter: `ticket.labels.filter(l => !l.startsWith("agent:"))` strips all agent-managed labels before appending the new status label. This ensures a ticket never accumulates stale `agent:running` labels from prior runs.

### 5.2 Affected Files

| File | Change |
|------|--------|
| `src/server/agents/manglerTools.ts` | `delegate_ticket` handler: add `agent:running` label + `board.updated` broadcast after run creation |
| `src/server/agents/orchestrator.ts` | `stopOrchestratedRun`: add `agent:stopped` label + `board.updated` broadcast before returning; `startOrchestratedRun` `finally` block: add `agent:done` / `agent:failed` label if run was not stopped |

No client changes, no schema changes, no new npm packages.

### 5.3 Implementation Approach

**`src/server/agents/manglerTools.ts` — `delegate_ticket` handler**

Insert after `runsRepo.create(...)` and before `void startOrchestratedRun(...)`:

```typescript
// Reflect delegation immediately on the board.
const runningLabels = [...ticket.labels.filter(l => !l.startsWith("agent:")), "agent:running"];
ticketsRepo.update(ticket.id, { labels: runningLabels });
broadcast({ type: "board.updated", projectId: ticket.projectId });
```

The `ticket` variable is already in scope (loaded at line 188 of the current file). `ticketsRepo` and `broadcast` are both already imported.

**`src/server/agents/orchestrator.ts` — `stopOrchestratedRun`**

Insert after `runsRepo.setStatus(runId, "stopped")` and before the final `broadcast({ type: "run.updated", runId })`:

```typescript
const stoppedRun = runsRepo.get(runId);
if (stoppedRun?.ticketId) {
  const ticket = ticketsRepo.get(stoppedRun.ticketId);
  if (ticket) {
    const labels = [...ticket.labels.filter(l => !l.startsWith("agent:")), "agent:stopped"];
    ticketsRepo.update(ticket.id, { labels });
    broadcast({ type: "board.updated", projectId: ticket.projectId });
  }
}
```

`ticketsRepo` is already imported (line 3 of the current file).

**`src/server/agents/orchestrator.ts` — `startOrchestratedRun` `finally` block**

Insert after `activeQueries.delete(run.id)`:

```typescript
if (run.ticketId) {
  const finalRun = runsRepo.get(run.id);
  if (finalRun && finalRun.status !== "stopped") {
    const ticket = ticketsRepo.get(run.ticketId);
    if (ticket) {
      const label = finalRun.status === "done" ? "agent:done" : "agent:failed";
      const labels = [...ticket.labels.filter(l => !l.startsWith("agent:")), label];
      ticketsRepo.update(ticket.id, { labels });
      broadcast({ type: "board.updated", projectId: ticket.projectId });
    }
  }
}
```

The `status !== "stopped"` guard prevents a double-write when `stopOrchestratedRun` has already fired and set `agent:stopped`. The `run.ticketId` is available from the `startOrchestratedRun` parameter — no additional DB read needed for the ticket ID itself (only for the current labels, which requires `ticketsRepo.get`).

### 5.4 Event Flow

```
delegate_ticket called
  → runsRepo.create (ticketId stored)
  → ticketsRepo.update({ labels: ["agent:running"] })
  → broadcast board.updated                     ← board shows "agent:running" badge immediately
  → void startOrchestratedRun(run, prompt)

[run executes...]

Case A: success/failure (terminal result message)
  → finally block fires
  → runsRepo.get(runId).status === "done" | "failed"
  → ticketsRepo.update({ labels: ["agent:done"] | ["agent:failed"] })
  → broadcast board.updated                     ← board shows terminal badge

Case B: manual stop via stopOrchestratedRun
  → runsRepo.setStatus(runId, "stopped")
  → ticketsRepo.update({ labels: ["agent:stopped"] })
  → broadcast board.updated                     ← board shows "agent:stopped" badge
  → finally block fires, sees status === "stopped", skips   ← no double-write
```

### 5.5 Dependencies

- No new npm packages
- No DB schema changes
- No `src/shared/types.ts` or `src/shared/ws.ts` changes
- No client-side changes (labels are already rendered on ticket cards; `board.updated` already triggers a refetch)

### 5.6 Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Labels not rendered as visible badges on ticket cards | Low | Validation step 2 will confirm; if not rendered, add a single-line label display to the ticket card component |
| `ticketsRepo.get` returns null for recently-deleted ticket | Very low | Both `stopOrchestratedRun` and the `finally` block guard with `if (ticket)` before writing |
| `finally` block double-write race with `stopOrchestratedRun` | Very low | Status check (`!== "stopped"`) is a synchronous SQLite read; SQLite's serialized write queue ensures consistency |
| Re-delegating a ticket that already has `agent:done` | Not a risk | The label filter (`!l.startsWith("agent:")`) strips the prior label before writing `agent:running` |

### 5.7 Validation Strategy

1. **Unit test:** In `src/server/agents/manglerTools.test.ts`, mock `ticketsRepo` and assert that after `delegate_ticket`, the ticket's labels include `"agent:running"` and `board.updated` was broadcast. Existing `manglerTools.test.ts` already mocks `broadcast`.
2. **Integration test (manual):**
   - Start `npm run dev`; create a project with tickets
   - Open the kanban board in a browser tab
   - Ask Mangler to delegate a ticket
   - Verify `agent:running` label appears on the ticket card without a page refresh
   - Let the run complete (or use the Stop button)
   - Verify `agent:done` or `agent:stopped` label replaces `agent:running`
3. **Edge case:** Manually stop a run mid-execution; verify the board shows `agent:stopped`, not `agent:running`
4. **Re-delegation:** Delegate the same ticket a second time; verify the board shows `agent:running` (not two agent labels)
5. **Regression:** Run `npm test` to confirm all existing tests pass

### 5.8 Success Criteria

- `agent:running` label appears on ticket card within one WebSocket round-trip of delegation
- Terminal labels (`agent:done`, `agent:failed`, `agent:stopped`) replace `agent:running` after run ends
- No `agent:*` label accumulation on repeated delegations
- All existing tests pass (`npm test`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)

---

*End of Run 2 — 2026-06-08*
