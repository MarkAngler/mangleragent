# FEATURE IMPROVEMENT ANALYSIS

> **Persistent ledger for nightly improvement runs.**
> Never delete prior entries. Append new ideas under their component, using the stable ID format below.
> Status values: `Proposed` | `Planned` | `Done`

---

## Run Log

| Run | Date | Ideas Added | Idea Selected |
|-----|------|-------------|---------------|
| 1 | 2026-06-07 | MA-001, MA-002, MA-003, OR-001, OR-002, OR-003, RT-001, SC-001, SC-002, SC-003, ME-001, ME-002, DF-001 | MA-002 |
| 2 | 2026-06-10 | PA-001, EV-001, OR-004, FTS-001 | EV-001 |

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

## Run 2 — 2026-06-10

### 1. Product Comprehension Update

No material changes to the core component inventory since Run 1. Key observation from code review:

- **MA-002 confirmed Done:** `mangler.ts:180` passes `system` as a `TextBlockParam[]` with `cache_control: {type: "ephemeral"}`, exactly as planned. All other ideas remain Proposed.
- **`runEngine.ts` gap confirmed:** `handleMessage()` handles `msg.type === "result"` at line 82–89 but extracts only `msg.result` (summary text) and `msg.subtype`. The SDK's `total_cost_usd` and `modelUsage` fields on the result message are ignored — supports OR-001 and the new EV-001.
- **`agent_runs` schema gap confirmed:** No `score` or `score_reason` columns; `summary` is the only post-run quality artifact.
- **Parallel runs confirmed absent:** `startOrchestratedRun` and `startAgentRun` are fire-and-forget functions; there is no mechanism to fan out or group multiple runs.

---

### 2. Frontier Research Findings (Run 2)

#### 2.7 Claude Agent SDK Cost Tracking

**Key advances (confirmed June 2026):**

- The SDK's `result` message (`msg.type === "result"`) carries two new fields: `total_cost_usd` (number, client-side estimate) and `modelUsage` (Map of model name → `{inputTokens, outputTokens, costUsd}`). Available in TypeScript as `SDKResultMessage`.
- Per-step usage is also available: each assistant message contains a `usage` sub-object with `input_tokens` and `output_tokens`.
- **Important caveat:** `total_cost_usd` is computed from a price table bundled at SDK build time — it is an estimate, not an authoritative billing figure. For billing, use the Anthropic Usage API.
- From June 15 2026, Agent SDK usage is metered separately from interactive Claude Code — making per-run cost tracking more important for users.
  - Sources: [Claude Code Docs — Track cost and usage](https://code.claude.com/docs/en/agent-sdk/cost-tracking); [Anthropic Docs — Track cost and usage](https://platform.claude.com/docs/en/agent-sdk/cost-tracking); [Totalum — Claude Agent SDK 2026](https://www.totalum.app/blog/claude-agent-sdk-totalum-2026)

#### 2.8 Parallel Fan-Out / Dynamic Workflows

**Key advances (May–June 2026):**

- **Opus 4.8 Dynamic Workflows** (shipped May 28 2026): Claude writes a JavaScript orchestration script that fans out to up to 1,000 subagents in parallel; used for decomposing large tasks into concurrent subtasks with automatic result merging.
  - Source: [InfoQ — Dynamic Workflows, June 2026](https://www.infoq.com/news/2026/06/dynamic-workflows-claude-code/); [Claude Code Docs — Workflows](https://code.claude.com/docs/en/workflows)
- **Agent Teams**: one session acts as team lead, assigns tasks to teammates (isolated context windows), synthesizes results. Relies on a shared task list as the coordination layer. Recommended team size: 3–5 for most workflows.
  - Source: [Claude Code Docs — Agent Teams](https://code.claude.com/docs/en/agent-teams); [MindStudio — Agent Teams Parallel Agents](https://www.mindstudio.ai/blog/claude-code-agent-teams-parallel-agents)
- **TypeScript fan-out pattern**: `Promise.all()` over multiple `query()` calls, each with its own context and isolated storage. Each sub-agent sees only what the orchestrator passes to it.
  - Source: [Shipyard — Multi-agent orchestration for Claude Code](https://shipyard.build/blog/claude-code-multi-agent/)
- **SQLite as workflow state**: developers have converged on SQLite-backed directed acyclic graphs for step tracking; language models interact more efficiently with targeted SQL queries than large JSON blobs.
  - Source: [TechTimes — SQLite Beats Cloud Queues for AI Agent Orchestration](https://www.techtimes.com/articles/317448/20260530/sqlite-beats-cloud-queues-ai-agent-orchestration-obelisk-engine-creator-claims.htm)

**Conflict / caveat:** Dynamic Workflows require Opus 4.8 and the latest Claude Agent SDK. Stability on long fan-outs (>50 subagents) is still community-validated.

#### 2.9 LLM-as-Judge / Agent Eval Frameworks

**Key advances (2026):**

- **G-Eval** and **DeepEval v4.0.3**: LLM-as-judge metrics that score on task completion, tool correctness, and faithfulness; trajectory evaluation scores the full execution path, not just the final output.
  - Source: [DigitalApplied — AI Agent Eval Frameworks 2026](https://www.digitalapplied.com/blog/ai-agent-eval-frameworks-testing-guide-2026); [MLflow — Top 5 Agent Evaluation Frameworks](https://mlflow.org/top-5-agent-evaluation-frameworks/)
- **Eval-driven development**: CI pattern — eval dataset of 50 examples, pass threshold ≥0.85 average score. Now standard in production agentic pipelines.
  - Source: [Red Hat Developer — Eval-driven development, March 2026](https://developers.redhat.com/articles/2026/03/23/eval-driven-development-build-evaluate-ai-agents)
- **Anthropic three-agent harness** (April 2026): separate planning, generation, and evaluation agents with structured handoff artifacts and context resets between stages. The evaluation agent is a first-class participant, not an afterthought.
  - Source: [InfoQ — Anthropic three-agent harness, April 2026](https://www.infoq.com/news/2026/04/anthropic-three-agent-harness-ai/)
- **Key finding**: "Trajectory evaluation scores the entire execution path — every tool call, every intermediate reasoning step, every turn — not just the final answer." This is achievable with `agent_events` rows already stored per run.
  - Source: [DigitalApplied — AI Agent Evaluation Pipeline 2026](https://www.digitalapplied.com/blog/ai-agent-evaluation-pipeline-2026-testing-methodology)

#### 2.10 Structured Handoff Artifacts

**Key advances (April 2026):**

- **Anthropic structured outputs**: `betas: ["output-schema-2025-02-19"]` on the messages API guarantees JSON-schema-compliant responses via constrained decoding; eliminates parsing errors; type-safe.
  - Source: [Anthropic — Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- **Three-agent harness handoff artifacts**: typed JSON blobs that define the boundary between agents, enabling context resets without information loss. Each subsequent agent receives only the structured output, not the full prior context window.
  - Source: [InfoQ — Anthropic three-agent harness, April 2026](https://www.infoq.com/news/2026/04/anthropic-three-agent-harness-ai/)

#### 2.11 SQLite Vector Search for Local Memory

**Key advances (2025–2026):**

- **`sqlite-vec`** (asg017, GitHub): pure-C SQLite extension for vector search; vectors stored as BLOBs; supports cosine/L2 distance; runs anywhere SQLite runs; zero infrastructure; Apache-2.0 license.
  - Source: [GitHub — asg017/sqlite-vec](https://github.com/asg017/sqlite-vec); [DEV Community — sqlite-vec embedded intelligence](https://dev.to/aairom/embedded-intelligence-how-sqlite-vec-delivers-fast-local-vector-search-for-ai-3dpb)
- **OpenClaw**: RAG-lite local indexing powered entirely by SQLite — chunks Markdown, generates embeddings, stores in a `.sqlite` file. Demonstrates that ME-001's local memory concept is fully proven in the wild.
  - Source: [PingCAP — Local-First RAG with SQLite](https://www.pingcap.com/blog/local-first-rag-using-sqlite-ai-agent-memory-openclaw/)
- **Relevance to ME-001**: `sqlite-vec` resolves the "SQLite is not a purpose-built vector store" risk in ME-001's entry. Cosine similarity is a native distance function, not a JS loop.

#### 2.12 SQLite FTS5 for Run Search

- **SQLite FTS5** (stable, built-in since SQLite 3.9 / 2015): `CREATE VIRTUAL TABLE ... USING fts5(...)` enables full-text search over text columns. Query with `WHERE tbl MATCH ?`. Porter stemmer available. Zero new dependencies.
- **Pattern**: shadow-index `agent_runs(title, summary)` with a `runs_fts` FTS5 virtual table; sync via repo layer on insert/update. SQLite `INSERT INTO runs_fts(runs_fts, rank) VALUES('rank', 'bm25(10,1)')` tunes BM25 ranking.
  - Source: [SQLite FTS5 documentation](https://www.sqlite.org/fts5.html) — VERIFIED

---

### 3. Idea Log (Run 2)

---

### Component: Agent Teams / Parallel Orchestration *(new component)*

---

#### [PA-001] Parallel Agent Fan-Out from Mangler
- **Date:** 2026-06-10
- **Status:** Proposed
- **Enabling advancement:** Claude Agent SDK Dynamic Workflows (Opus 4.8, May 2026); Agent Teams coordination pattern; `Promise.all()` fan-out over multiple `query()` calls
- **Gap addressed:** Mangler's `delegate_ticket` tool creates exactly one orchestrated run per call. Tasks that decompose into independent sub-tasks (e.g., "fix failing tests in each of these 5 modules") require N sequential delegations, each blocking on human plan approval. There is no built-in way to dispatch concurrent sub-runs and wait for all to complete.
- **User benefit:** Tell Mangler "run the test-fixer on all five packages in parallel"; it fans out five runs simultaneously, each with an isolated context. The board updates as each completes. Total wall-clock time drops from 5× a single run to roughly 1× (plus coordination overhead).
- **Approach:** Add a `delegate_parallel` tool to `manglerTools.ts` that accepts an array of `{ticketId?, prompt}` objects. For each, call `runsRepo.create()` and kick off `startOrchestratedRun()`. Track them under a new `parent_run_id TEXT` FK on `agent_runs`. Broadcast a `batch.started` WS event with all child run IDs. The batch is complete when all children reach terminal status. In the UI, the Active Agents page groups child runs under their parent.
- **Affected files:** `src/server/agents/manglerTools.ts`, `src/server/db/schema.ts` (new FK), `src/server/db/runs.ts`, `src/shared/types.ts`, `src/client/pages/ActiveAgentsPage.tsx`
- **Complexity:** High (new schema column, new tool, UI grouping, coordination logic)
- **Risk:** Concurrent human-approval prompts for N plan reviews simultaneously is disruptive; needs a default `approver: "agent"` for fan-out sub-runs

---

### Component: Observability / Eval *(new component)*

---

#### [EV-001] LLM-as-Judge Run Quality Score
- **Date:** 2026-06-10
- **Status:** Planned
- **Enabling advancement:** G-Eval / trajectory evaluation pattern (DeepEval v4.0.3, 2026); Anthropic three-agent harness QA step (InfoQ April 2026); existing `agent_events` table already stores full execution trajectory per run
- **Gap addressed:** When an orchestrated or agent run completes, the user's only quality signal is the `summary` string and reading the full transcript. With multiple concurrent runs active, there is no fast way to triage "which runs need my attention?" Users waste time reading passing runs to confirm success.
- **User benefit:** Each completed run displays a 0-100 quality score and a one-sentence rationale. Score drives a green/yellow/red badge in the run list. Users immediately know which runs to inspect and which to close. Over time, score history enables detecting regressions in agent prompts.
- **Approach:** In `runEngine.ts`, when `msg.type === "result"` and `msg.subtype === "success"`, call a new `scoreRun(runId, summary)` helper *asynchronously* (does not block the result broadcast). The helper retrieves the run record, fetches the last 10 `agent_events` rows for context, then calls `getAnthropic().messages.create()` with a scoring prompt. Response is JSON `{score: <0-100>, reason: "<sentence>"}` via Anthropic structured outputs. Store in two new columns on `agent_runs`; broadcast `run.scored` WS event. Graceful no-op on failure (score null, no disruption to the run lifecycle).
- **Affected files:** `src/server/db/schema.ts`, `src/server/db/runs.ts`, `src/shared/types.ts`, `src/server/agents/runEngine.ts`, `src/client/components/RunListDetail.tsx`, `src/shared/ws.ts`
- **Complexity:** Low-Medium (one new async LLM call, two new DB columns, one WS message type, one UI badge)
- **Risk:** Score call fails → handled silently, run lifecycle unaffected. Score is miscalibrated → advisory-only, never blocking. Latency: ~1–2 s after run completion, async.

---

### Component: Orchestrated Agent Runs *(existing)*

---

#### [OR-004] Structured Output Schema for Orchestrated Runs
- **Date:** 2026-06-10
- **Status:** Proposed
- **Enabling advancement:** Anthropic structured outputs with constrained decoding (`betas: ["output-schema-2025-02-19"]`); three-agent harness structured handoff artifacts (InfoQ April 2026)
- **Gap addressed:** Orchestrated runs produce an opaque text summary in `agent_runs.summary`. For automation workflows — a run that extracts bug reports, a run that inventories dependencies — there is no machine-readable output, and chaining runs requires re-parsing freeform text.
- **User benefit:** Power users can declare an optional JSON Schema on a run. When the run completes, Mangler makes a brief structured-output extraction call and stores the validated JSON as `structured_output` on the run. Mangler tools can then reference `structured_output` from prior runs as input to new delegations, enabling composable run pipelines.
- **Approach:** Add an optional `output_schema TEXT` (JSON Schema string) column to `agent_runs`. In `runEngine.ts`'s result handler, if `output_schema` is set, call `getAnthropic().messages.create()` with `betas: ["output-schema-2025-02-19"]` and store the validated result in a new `structured_output TEXT` column. Expose via `GET /api/runs/:id/output`. Add a schema field to the orchestrated run creation UI.
- **Affected files:** `src/server/db/schema.ts`, `src/server/db/runs.ts`, `src/shared/types.ts`, `src/server/agents/runEngine.ts`, `src/server/api/runs.ts`, `src/client/components/OrchestratedRunView.tsx`
- **Complexity:** Medium (schema migration, conditional LLM call, new API endpoint, UI field)
- **Risk:** Structured outputs beta API may change; validation failures need graceful handling

---

### Component: Search / Navigation *(new component)*

---

#### [FTS-001] Full-Text Run Search via SQLite FTS5
- **Date:** 2026-06-10
- **Status:** Proposed
- **Enabling advancement:** SQLite FTS5 (stable, built-in since SQLite 3.9; zero new dependencies); BM25 ranking; Porter stemmer
- **Gap addressed:** The Active Agents page lists runs in reverse-chronological order with no search. A staff engineer managing dozens of projects will accumulate hundreds of runs. Finding "the migration-plan run from two weeks ago" currently requires scrolling or knowing the project.
- **User benefit:** A search bar in the runs list that filters by keyword across run titles and summaries in real time. Queries like "auth refactor" or "test fix" instantly surface matching runs across all projects.
- **Approach:** Create a `runs_fts` FTS5 virtual table in the schema shadowing `agent_runs(id, title, summary)`. Sync on insert and on `setSummary` in `runsRepo`. Add `GET /api/runs?q=:query` to the runs API endpoint (or extend the existing list endpoint). The query uses `runs_fts MATCH ?` with BM25 ranking via `ORDER BY rank`. In the UI, add a debounced search input above the runs list in `RunListDetail.tsx` that passes `q` as a query parameter.
- **Affected files:** `src/server/db/schema.ts`, `src/server/db/runs.ts`, `src/server/api/runs.ts`, `src/client/components/RunListDetail.tsx`
- **Complexity:** Low-Medium (FTS5 DDL + 2 sync calls in the repo + 1 API param + 1 UI input)
- **Risk:** FTS5 index can drift from the base table if `runs_fts` sync is missed in a repo method; must audit all write paths. Minimal otherwise.

---

### 4. Improvement Selection (Run 2)

#### Selected: [EV-001] — LLM-as-Judge Run Quality Score

**Justification against product objective:**

The product's goal is to help a staff engineer move work forward with confidence. Right now, every completed run looks the same in the UI regardless of whether the agent succeeded brilliantly or silently produced broken output. The user must read transcripts to triage — a task that grows linearly with run volume and defeats the purpose of autonomous delegation.

EV-001 closes this gap with minimal surface area. The infrastructure is fully ready:
- `runEngine.ts` already has the result message handler at line 82.
- The LLM call pattern already exists twice in the codebase (`reviewPlan` in `orchestrator.ts`, `reviewToolCall` in `agentRun.ts`).
- `agent_events` already stores the full execution trajectory needed for judge context.
- Anthropic structured outputs guarantee the `{score, reason}` JSON shape without fragile parsing.

The complexity delta is: 2 DB columns + 1 helper function + 1 WS message type + 1 UI badge. No new dependencies, no schema-breaking changes, no client-side behavioral changes.

**Ideas excluded this run:**
- **PA-001 (Parallel Fan-Out)**: Highest impact but highest complexity; needs schema changes, a new tool, UI grouping, and careful approval-flow design. Appropriate after the simpler observability layer is in place.
- **OR-004 (Structured Output)**: Valuable for automation workflows but niche — most users don't chain runs programmatically yet. Good follow-on once EV-001 is done.
- **FTS-001 (Run Search)**: High day-to-day value but does not require frontier research to validate — straightforward SQLite FTS5 work. Appropriate for a future run when the idea log is fuller.

---

### 5. Implementation Plan: [EV-001] LLM-as-Judge Run Quality Score

**Objective:** After each successful orchestrated or agent run completes, asynchronously score the output 0–100 using an LLM judge. Store the score and a one-sentence rationale in the run record. Show a color-coded badge in the run detail view.

#### 5.1 How the Judge Works

A brief, stateless LLM call receives: the run's task description (title + prompt summary), the run's completion summary, and a sample of the execution trajectory (last 10 `agent_events` rows). It responds with structured JSON `{score: number, reason: string}`. The judge is instructed to score on three axes — task completion, output correctness, and execution efficiency — weighted toward completion (50 / 30 / 20).

The call uses Anthropic structured outputs (`betas: ["output-schema-2025-02-19"]`) to guarantee the `{score, reason}` shape. Model: `claude-haiku-4-5-20251001` (fast, cheap; the judge doesn't need deep reasoning). The call is fire-and-forget relative to the run lifecycle: the run is already marked `done` before the score arrives.

#### 5.2 Affected Files

| File | Change |
|------|--------|
| `src/server/db/schema.ts` | Add `score INTEGER` and `score_reason TEXT` columns to `agent_runs` |
| `src/server/db/runs.ts` | Add `setScore(id, score, reason)` method; include `score`/`scoreReason` in `toRun()` |
| `src/shared/types.ts` | Add `score: z.number().nullable()` and `scoreReason: z.string().nullable()` to `AgentRun` |
| `src/server/agents/runEngine.ts` | In the `"result"` branch of `handleMessage`, call `void scoreRun(runId, summary, title)` |
| `src/server/agents/runEngine.ts` | New `scoreRun` helper: fetches last 10 events, calls LLM, calls `runsRepo.setScore()`, broadcasts `run.scored` |
| `src/shared/ws.ts` | Add `run.scored` message type: `{type: "run.scored", runId: string, score: number, scoreReason: string}` |
| `src/client/components/RunListDetail.tsx` | Show score badge on the run list item and in the detail header |

No new npm packages. No changes to the orchestrator, agentRun, or any other server file.

#### 5.3 Schema Changes

```sql
-- Additive migration; existing rows get NULL for both columns (score not available for historical runs).
ALTER TABLE agent_runs ADD COLUMN score INTEGER;
ALTER TABLE agent_runs ADD COLUMN score_reason TEXT;
```

Better-sqlite3's synchronous DDL handles `ALTER TABLE ADD COLUMN` safely on existing databases. The migration runs in the `db()` init sequence alongside `SCHEMA`.

#### 5.4 Judge Prompt (Target)

```
System: You are an agent-run evaluator. Score the following completed agent run on a scale of 0–100.

Criteria:
- Task completion (50 pts): Did the agent accomplish the stated goal?
- Output correctness (30 pts): Is the code/output correct and appropriate?  
- Execution efficiency (20 pts): Did the agent avoid redundant or wasted tool calls?

Respond with valid JSON: {"score": <integer 0-100>, "reason": "<one sentence rationale>"}

User:
Task: {run.title}
Summary: {run.summary}
Trajectory sample (last 10 events):
{events as compact JSON}
```

The system message and partial user context (title) are stable and cache-eligible under the existing `cache_control` pattern.

#### 5.5 Score Badge UI

| Score | Color | Label |
|-------|-------|-------|
| 80–100 | Green (`good`) | Score number |
| 50–79 | Yellow (`warn`) | Score number |
| 0–49 | Red (`bad`) | Score number |
| null | No badge | — |

Badge renders as `<Mono>` text with `text-good`/`text-warn`/`text-bad` class, matching the existing tone system in `ui.tsx`. Shown in the run list item (after the status) and in the RunListDetail header.

#### 5.6 Dependencies

- `@anthropic-ai/sdk` — already installed; structured outputs beta supported
- `better-sqlite3` — already installed; `ALTER TABLE ADD COLUMN` is safe and non-destructive
- No new packages
- No environment variable changes
- No client build changes beyond the badge

#### 5.7 Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Judge LLM call fails (API error, timeout) | Low-Medium | `scoreRun` wraps in try/catch; on failure logs the error and exits silently — run lifecycle and DB unaffected |
| Judge response is not valid JSON | Low | Structured outputs guarantee schema; fallback: catch parse error, skip |
| Score is systematically miscalibrated | Medium | Score is advisory-only and labeled; no run is blocked or auto-retried on score |
| Scoring haiku calls accumulate cost on high-volume usage | Low | Haiku pricing: ~$0.0008/run at 1,000 input + 50 output tokens. At 100 runs/day this is $0.08/day. Acceptable. |
| `ALTER TABLE ADD COLUMN` fails on an old DB with a conflicting column | Very Low | SQLite `ADD COLUMN` is idempotent if the column doesn't exist; add a guard or use `IF NOT EXISTS` equivalent (run in init with error suppression for already-exists) |
| Databricks provider path: scoring uses `getAnthropic()` while Databricks runs on a different client | Low | Guard: skip scoring when `configRepo.get("mangler_provider") === "databricks"` and Anthropic key is absent |

#### 5.8 Validation Strategy

1. **Unit test** (`src/server/agents/runEngine.ts` or new `runEngine.score.test.ts`): mock `getAnthropic()` and `runsRepo.setScore()`; assert `scoreRun` is called with expected arguments when a success result message arrives; assert it is NOT called for `failed` or `stopped` results.
2. **Integration test (manual)**: run a short orchestrated task; confirm DB row has `score` (0–100) and `score_reason` (non-empty string) populated after completion.
3. **Failure resilience test**: set an invalid API key in a test config; confirm the run still completes normally with `score = null`.
4. **UI test**: verify the badge renders in the correct color for scores 90, 60, and 30.
5. **Full suite**: `npm test` must pass; `npm run typecheck` must pass; `npm run lint` must pass.

#### 5.9 Success Criteria

- Completed orchestrated and agent runs (non-PTY) show a score badge in RunListDetail
- `agent_runs.score` and `agent_runs.score_reason` are populated in SQLite after each successful run
- `run.scored` WS event is broadcast with correct payload
- Failed and stopped runs do not trigger scoring
- All existing tests pass
- `npm run typecheck` and `npm run lint` pass with zero errors

---

*End of Run 2 — 2026-06-10*
