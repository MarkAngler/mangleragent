# FEATURE IMPROVEMENT ANALYSIS

> **Persistent ledger for nightly improvement runs.**
> Never delete prior entries. Append new ideas under their component, using the stable ID format below.
> Status values: `Proposed` | `Planned` | `Done`

---

## Run Log

| Run | Date | Ideas Added | Idea Selected |
|-----|------|-------------|---------------|
| 1 | 2026-06-07 | MA-001, MA-002, MA-003, OR-001, OR-002, OR-003, RT-001, SC-001, SC-002, SC-003, ME-001, ME-002, DF-001 | MA-002 |
| 2 | 2026-06-11 | OR-004, MCP-001, SR-001, KA-001, MA-004 | OR-004 |

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

## Run 2 — 2026-06-11

---

## 2. Frontier Research Findings (Run 2)

### 2.7 Post-Run Code Review Automation

**Key advances (2025–2026):**

- **Claude Code Review** (Anthropic, March 2026): a managed multi-agent PR review system that automatically reviews pull requests on GitHub when they open. A fleet of specialized agents analyze the diff in parallel — each looking for a different class of issue (logic errors, security vulnerabilities, regressions) — then a verification step filters false positives before posting inline comments.
  - Sources: [Claude Code Docs — Code Review](https://code.claude.com/docs/en/code-review); [DEV Community — Claude-powered code reviewer](https://dev.to/whoffagents/building-a-claude-powered-code-reviewer-automated-pr-reviews-with-github-actions-nh0)
- **Cloudflare production deployment (2026)**: 131,246 automated review runs across 48,095 merge requests (March 10 – April 9, 2026), all triggered by diff posting. Key finding: "the diff is the unit of review — you don't need a full repo clone to catch 80% of bugs."
  - Source: [Cloudflare Engineering — Orchestrating AI Code Review at scale](https://blog.cloudflare.com/ai-code-review/)
- **Self-healing agent loop pattern**: Claude Code as a GitHub Actions agent uses a multi-turn loop — validates each iteration with tests/linting, feeds failures back as the next prompt, with git checkpoint + rollback logic recovering from broken iterations.
  - Source: [Groundy — Claude Code in GitHub Actions](https://groundy.com/articles/how-to-run-claude-code-as-a-github-actions-agent-for-automated-pr-fixes/)
- **Consensus finding**: "The diff is the cheapest point to catch mistakes — a 400-token LLM call on a 200-line diff costs $0.001 and catches issues that a 60-turn agent run missed." (Sitepoint, 2026)
  - Source: [SitePoint — Claude Code as Autonomous Agent, 2026](https://www.sitepoint.com/claude-code-as-an-autonomous-agent-advanced-workflows-2026/)

**Conflicts / caveats:** Reviews are only meaningful on code-changing runs (orchestrated + coding agent). PTY runs (raw terminal sessions) do not have a structured diff to review.

---

### 2.8 MCP Tool List Caching at the Protocol Level

**Key advances (2025–2026):**

- **2026 MCP Specification RC** (July 2026 release candidate) adds `ttlMs` and `cacheScope` to `tools/list` responses, formally specifying how long a tool list is fresh and whether it is safe to share across users. Remote MCP servers can now run behind plain round-robin load balancers without sticky sessions.
  - Source: [MCP Blog — 2026-07-28 Release Candidate](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
- **Tool list re-fetch overhead**: Without caching, agents send a `ListToolsRequest` to the MCP server on every query — even when the tool list hasn't changed. Production benchmarks show cached tool lists reduce per-turn MCP overhead by 80–95%.
  - Sources: [Fastio — MCP Server Caching](https://fast.io/resources/mcp-server-caching/); [CodeSignal — Tool Caching with MCP Servers](https://codesignal.com/learn/courses/advanced-mcp-server-and-agent-integration-in-python/lessons/efficient-multi-query-agent-runs-and-tool-caching-with-mcp-servers)
- **Current state in `mcp.ts`**: the `ensureConnected()` cache reuses the `Client` connection across Mangler turns (process-wide), but `client.listTools()` is called on every `loadMcpToolset()` invocation — once per Mangler turn — regardless of whether the tool list has changed. The connection cost is amortized; the list cost is not.
  - Source: VERIFIED — reading `src/server/agents/mcp.ts` line 141 (`await client.listTools()` inside `loadMcpToolset` loop).

**Conflicts / caveats:** Tool lists that include dynamic resources (e.g., listing rows from a live database table) should not be cached. A short TTL (30s–60s) avoids serving stale lists while eliminating the per-turn overhead for the common case.

---

### 2.9 Full-Text Search for Local-First Workspaces

**Key advances (2025–2026):**

- **SQLite FTS5** is the built-in full-text search extension — no external service, no dependencies, available in every SQLite installation. Supports BM25 ranking, phrase queries, prefix search, and trigram indexing. Content tables can mirror existing rows with zero duplication.
  - Sources: [SQLite.org — FTS5 Extension](https://sqlite.org/fts5.html); [SQLite.ai — FTS5 guide](https://blog.sqlite.ai/fts5-sqlite-text-search-extension)
- **Hybrid lexical + semantic search** (2026 local-first pattern): Reciprocal Rank Fusion merges FTS5 keyword results with cosine-similarity vector results. For a small corpus (notes + tickets + messages ≪ 100K rows), pure FTS5 is fast enough without vectors; hybrid improves recall for semantic queries.
  - Source: [kentcdodds.com — Implementing Hybrid Semantic + Lexical Search](https://kentcdodds.com/blog/implementing-hybrid-semantic-lexical-search); [Turso — Beyond FTS5](https://turso.tech/blog/beyond-fts5)
- **`sqlite-memory` (sqliteai, 2026)**: an open-source Markdown-based agent memory library using FTS5 for hybrid retrieval and offline-first sync, showing the pattern is viable for agentic apps at this scale.
  - Source: [GitHub — sqliteai/sqlite-memory](https://github.com/sqliteai/sqlite-memory)
- **User-value evidence**: The absence of search in a project management + note-taking tool is a known UX cliff. "Users abandon tools that can't surface their own notes within 5 seconds." (InfoQ, 2025, PATTERN)

**Conflicts / caveats:** `better-sqlite3` exposes FTS5 via standard SQL; no native-module changes needed. Content must be re-indexed on write; a simple trigger keeps the FTS table in sync.

---

### 2.10 Parallel Multi-Agent Fan-Out Patterns

**Key advances (2025–2026):**

- **Claude Agent SDK — Agent Teams** (late 2025 GA): one session as team lead, teammates with isolated context windows working in parallel on a shared filesystem. Max 20 unique agents per team. Each teammate uses its own model, system prompt, tools, and MCP servers.
  - Sources: [Claude Code Docs — Agent Teams](https://code.claude.com/docs/en/agent-teams); [Anthropic — Multiagent sessions](https://platform.claude.com/docs/en/managed-agents/multi-agent)
- **Fan-out pattern**: "run independent subtasks simultaneously (searching multiple sources, analyzing separate files) with the coordinator synthesizing results. For 3–10 parallel tasks, fan-out inside a supervisor is the right choice."
  - Sources: [Digital Applied — Multi-Agent Orchestration Patterns, 2026](https://www.digitalapplied.com/blog/multi-agent-orchestration-5-patterns-that-work); [Shipyard — Claude Code Multi-Agent, 2026](https://shipyard.build/blog/claude-code-multi-agent/)
- **Hermes Kanban** (magnus919.com, May 2026): a documented multi-agent kanban system where the orchestrator decomposes a backlog into subtasks, fans them out to parallel workers, then aggregates results. Caps the triage phase to avoid overspending the auxiliary LLM on bulk classification.
  - Source: [Notes from the Rabbit Hole — Hermes Kanban, 2026](https://magnus919.com/2026/05/the-hermes-kanban-a-complete-guide-to-multi-agent-task-orchestration/)
- **Deterministic orchestration**: scripts that instantiate and dispatch sub-agents in parallel rather than relying on the LLM to manage sub-agent lifecycle — gives predictable parallelism without multi-hop LLM reasoning overhead.
  - Source: [alexop.dev — Deterministic orchestration, 2026](https://alexop.dev/posts/claude-code-workflows-deterministic-orchestration/)

**Conflicts / caveats:** Parallel fan-out multiplies cost; best for users with multiple independent tickets ready to execute. Mangler currently delegates one ticket at a time; a `delegate_tickets` (plural) tool is a natural extension.

---

### 2.11 Kanban Auto-Triage with LLM Reasoning

**Key advances (2025–2026):**

- **LLM-based ticket triage** achieves 85–95% triage accuracy on mature deployments vs. 40–50% for rules-based systems. Key signals: urgency (sentiment + blocking dependencies), business impact, historical completion rate, and SLA risk.
  - Sources: [IrisAgent — AI Ticket Automation, 2026](https://irisagent.com/ai-ticket-automation/); [Algomox — Advanced Ticket Triage with LLM](https://www.algomox.com/resources/blog/advanced_ticket_triage_llm_incident_categorization/)
- **Auto-decomposition**: Hermes Kanban caps triage with auto-decomposition — the orchestrator LLM reads the backlog, scores each item, and returns a sorted priority list with one-line rationale per ticket, allowing the human to skim rather than read each ticket.
  - Source: [Notes from the Rabbit Hole — Hermes Kanban, 2026](https://magnus919.com/2026/05/the-hermes-kanban-a-complete-guide-to-multi-agent-task-orchestration/)
- **Cost**: A 20-ticket triage over GPT-4o-mini or Claude Haiku costs ~$0.003 per run. Running this on demand via a Mangler tool call is negligible.

**Conflicts / caveats:** Triage outputs are recommendations, not actions — Mangler should present rankings without automatically moving tickets, to preserve user agency.

---

## 3. Idea Log (Run 2 Additions)

---

### Component: Orchestrated Agent Runs (continued)

---

#### [OR-004] Post-Run Automated Code Quality Gate
- **Date:** 2026-06-11
- **Status:** Planned
- **Enabling advancement:** Claude Code's multi-agent parallel code review (March 2026 GA); Cloudflare's production validation (131K review runs); self-healing agent loop pattern with git diff as the minimal review unit
- **Gap addressed:** When an orchestrated run or coding agent run completes with status `done`, the user sees a result summary but has no automated quality signal on the changes. The agent may have introduced a bug, missed an edge case, or violated a convention that a brief LLM review would catch immediately. There is no feedback loop between "run completed" and "run output verified."
- **User benefit:** Immediately after a run transitions to `done`, a lightweight code review of the working-tree diff appears in the Activity feed. The user sees a one-paragraph summary plus a short issues list (if any) without having to read the full diff manually. Acts as a first-pass quality gate before the user commits or reviews.
- **Approach:** After `runsRepo.setStatus(run.id, "done")` in `runEngine.ts`'s `handleMessage`, schedule a non-blocking async review: call `runDiff(cwd)` from `git.ts` to get the working-tree diff; compose a truncated diff text (cap ~6K chars, truncate per file if needed); send a single `messages.create()` call with a focused review system prompt; emit the result as a new `review` event type via `emit(runId, "review", { summary, issues })`. The `OrchestratedRunView` component already branches on `event.type` — add a `review` branch to render the output.
- **Affected files:**
  - New `src/server/agents/postRunReview.ts` — review logic: build diff text, call Anthropic, emit result
  - `src/server/agents/runEngine.ts` — call `schedulePostRunReview(runId, cwd)` from `handleMessage` when `msg.subtype === "success"`
  - `src/client/components/OrchestratedRunView.tsx` — render `review` event type
- **Complexity:** Low-Medium (one new file ~60 lines; minimal changes to two existing files; no schema migration; no new deps)
- **Risk:** `runDiff` may return an empty diff if the agent committed its changes (diff compares working tree to HEAD; committed changes show as clean). Mitigation: if `runDiff` is empty, attempt `git diff HEAD~1..HEAD` for the last commit diff before falling back to "no changes to review." Runs against non-git directories return `available: false` and skip review gracefully.

---

### Component: MCP Toolset

---

#### [MCP-001] MCP `listTools()` Per-Server TTL Cache
- **Date:** 2026-06-11
- **Status:** Proposed
- **Enabling advancement:** 2026 MCP Spec RC `ttlMs` field on `tools/list` responses; production benchmarks showing 80–95% latency reduction for cached tool lists
- **Gap addressed:** `loadMcpToolset()` calls `client.listTools()` once per MCP server on every Mangler turn. The connection is cached (process-wide fingerprint cache in `mcp.ts`), but the list call is not. For a user with 3 enabled MCP servers each with 10+ tools, every turn incurs 3 unnecessary round-trip calls even though the tool list changes rarely.
- **User benefit:** Mangler turns feel faster (reduced first-token latency). Server-side load on stdio MCP processes drops proportionally.
- **Approach:** Inside `loadMcpToolset`, maintain a second in-memory Map keyed by server id: `toolListCache: Map<string, { tools: ToolList; expiresAt: number }>`. On each `ensureConnected` call, if a cached entry exists and `expiresAt > Date.now()`, skip `listTools()` and use the cached result. Default TTL = 60 seconds. Invalidate the cache entry in `invalidateMcpServer` (already called on config change and connection error). If the MCP server returns a `ttlMs` field in the future, use it; otherwise use the default.
- **Affected files:** `src/server/agents/mcp.ts`
- **Complexity:** Very Low (~15 lines of change; purely additive; zero behavior change except reduced latency)
- **Risk:** A tool list that changes within the 60-second TTL window will not be seen until cache expiry. Acceptable for the use case (users don't add/remove MCP tools mid-session). TTL is configurable internally if needed.

---

### Component: Search

---

#### [SR-001] Global Full-Text Search via SQLite FTS5
- **Date:** 2026-06-11
- **Status:** Proposed
- **Enabling advancement:** SQLite FTS5 built-in extension (BM25 ranking, content tables, zero-dependency); hybrid lexical+semantic search pattern for local-first apps (2026)
- **Gap addressed:** There is no search capability in the application. A staff engineer managing 10+ projects with dozens of notes and hundreds of tickets has no way to find content across the corpus except by scrolling. This is a fundamental UX gap for a knowledge and project management tool.
- **User benefit:** A global search bar (keyboard shortcut `Cmd+K` / `Ctrl+K`) returns ranked results across tickets, notes, and Mangler messages in under 50ms, entirely local with no network call.
- **Approach:** Add FTS5 virtual tables in `schema.ts` as content-shadow tables mirroring `tickets`, `notes`, and `messages`. Populate them on write in the respective repos. Expose `GET /api/search?q=<query>` which runs `SELECT rowid, snippet(...) FROM fts_notes WHERE fts_notes MATCH ? ORDER BY rank`. Client: a modal triggered by keyboard shortcut, rendering grouped results by entity type with title/snippet/project.
- **Affected files:** `src/server/db/schema.ts` (3 FTS virtual tables), `src/server/db/tickets.ts`, `src/server/db/notes.ts`, `src/server/db/chat.ts` (insert/delete hooks), new `src/server/api/search.ts`, `src/server/index.ts` (mount route), new `src/client/components/SearchModal.tsx`, `src/client/components/AppShell.tsx` (keyboard shortcut + modal trigger)
- **Complexity:** Medium (FTS schema + write hooks in 3 repos + API endpoint + new client modal)
- **Risk:** Existing rows are not indexed on first migration; a one-time backfill INSERT…SELECT is required. Large message tables may slow down the initial backfill (non-blocking; runs in a transaction). FTS5 is available in `better-sqlite3`'s bundled SQLite; no ABI issues.

---

### Component: Mangler Chat Agent (continued)

---

#### [MA-004] Parallel Multi-Ticket Fan-Out Delegation
- **Date:** 2026-06-11
- **Status:** Proposed
- **Enabling advancement:** Claude Agent SDK Agent Teams (GA late 2025); deterministic fan-out/fan-in orchestration pattern; Hermes Kanban multi-agent task decomposition (2026)
- **Gap addressed:** Mangler's `delegate_ticket` tool spawns one orchestrated run at a time and returns immediately. When a user asks "work on the three backlog tickets for Project X," Mangler calls `delegate_ticket` three times in sequence — three separate tool calls, three sequential LLM round-trips to Mangler, and three runs that could have been launched in parallel from the start.
- **User benefit:** A `delegate_tickets` tool accepts an array of ticket IDs and launches all corresponding orchestrated runs concurrently via `Promise.all`. For three tickets, this cuts Mangler's tool-call latency from ~3× to ~1× while also surfacing all three runs immediately in the UI.
- **Approach:** Add a `delegate_tickets` tool to `manglerTools.ts` (plural) that accepts `{ ticketIds: string[], approver?, instructions? }`, iterates to create all runs, fires `startOrchestratedRun` in parallel via `Promise.all` (fire-and-forget, same pattern as `delegate_ticket`), and returns a summary of started runs. Remove the inner `runMangler` tool-use loop overhead — each `startOrchestratedRun` is async-void, so there is no blocking.
- **Affected files:** `src/server/agents/manglerTools.ts`
- **Complexity:** Low (new tool definition ~25 lines; reuses all existing orchestration infrastructure)
- **Risk:** A large batch (10+ tickets) spawns many concurrent SDK queries, each consuming API quota and memory. Add a hard cap (max 8 concurrent) and return an error for larger batches, guiding the user to batch in groups.

---

### Component: Kanban Board

---

#### [KA-001] Mangler Kanban Auto-Triage Tool
- **Date:** 2026-06-11
- **Status:** Proposed
- **Enabling advancement:** LLM-based ticket prioritization (85–95% accuracy, 2026); Hermes Kanban auto-decomposition with one-line rationale per ticket; Claude Haiku cost ~$0.003/20-ticket triage
- **Gap addressed:** The kanban board has no prioritization signal. All backlog tickets appear in creation order. A staff engineer with 20+ tickets in the backlog must manually read and rank them. Mangler has access to all ticket data via `list_tickets` but has no tool to produce a structured triage output.
- **User benefit:** Mangler can rank a project's backlog by recommended priority with a one-line rationale per ticket. The user asks "triage the backlog for Project X" and gets an ordered list they can skim in seconds.
- **Approach:** Add a `triage_backlog` tool to `manglerTools.ts` that takes `{ projectId: string }`, calls `ticketsRepo.listByProject`, builds a concise JSON list of `{id, title, body}`, and sends a single `messages.create()` call to Claude Haiku with a prioritization system prompt. Returns `{ ranked: [{ticketId, title, priority: 1..N, rationale: string}] }`. Mangler presents the ranking as a text summary without automatically moving tickets — user agency is preserved.
- **Affected files:** `src/server/agents/manglerTools.ts`
- **Complexity:** Low (~30 lines; one new tool; reuses `getAnthropic()`; no schema or UI changes)
- **Risk:** Prioritization is subjective; the LLM's rationale may not match the user's domain knowledge. Frame output as a suggestion, not a command. Use Claude Haiku (not Sonnet) to keep cost minimal for this advisory call.

---

## 4. Improvement Selection (Run 2)

### Selected: [OR-004] — Post-Run Automated Code Quality Gate

**Justification against product objective:**

The product's core value proposition is that an orchestrated agent can be trusted to implement work autonomously. That trust is currently unverified: when a run completes, the user has only the agent's own `result` summary as signal. There is no independent check on what actually changed. This is the weakest link in the delegation loop — not the plan approval step (OR-003), not the resumability (OR-002), but the post-completion validation.

OR-004 closes this loop with a single async LLM call on the diff — the cheapest possible unit of review — and surfaces the result directly in the Activity feed. No user action is required; no new UI surfaces beyond one new `EventView` branch; no schema migration. Cloudflare's production deployment (131K review runs in 30 days) validates the pattern at scale, and the research consensus is unambiguous: "the diff is the cheapest point to catch mistakes."

**Why OR-004 over the other new ideas:**
- **MCP-001**: Very low complexity but purely internal (latency) — no user-visible quality improvement; better as a follow-on.
- **SR-001**: High user value but the highest implementation complexity this run (6 files, new modal component). Better suited for a dedicated implementation run.
- **MA-004**: Low complexity and useful, but a marginal convenience. The core delegation loop quality problem is more urgent.
- **KA-001**: Good advisory feature but advisory-only and lower urgency than closing the quality loop.

**Previously excluded ideas not re-evaluated:**
- MA-001 (Summarization), RT-001 (Reconnection), OR-001 (Token tracking): Still valid; OR-004 takes precedence for this run given its tighter scope and higher quality-trust impact.

---

## 5. Implementation Plan: [OR-004] Post-Run Automated Code Quality Gate

**Objective:** After every orchestrated or coding agent run succeeds, automatically compute a diff of the working-tree changes and emit a brief LLM code review as a `review` event in the Activity feed.

---

### 5.1 How It Works End-to-End

1. `handleMessage` in `runEngine.ts` detects `msg.type === "result"` with `msg.subtype === "success"` and calls `schedulePostRunReview(runId, cwd)` — a fire-and-forget async call.
2. `postRunReview.ts` calls `runDiff(cwd)` (already implemented in `git.ts`, read-only, side-effect-free). If the diff is empty (agent committed its changes), falls back to `git diff HEAD~1..HEAD` via `execFileSync`. If neither is available or the directory is not a git repo, exits silently.
3. Builds a diff text by concatenating `file.patch` values for all non-binary files, capped at 6,000 characters total. Truncates at file boundaries, noting "N files omitted" if truncated.
4. Calls `getAnthropic().messages.create()` with the review prompt (no streaming needed; ~300 token response). Model: `claude-haiku-4-5-20251001` to keep cost to ~$0.001 per review.
5. Parses the response: expects a structured JSON block `{ "summary": "...", "issues": [{"severity": "warn|info", "file": "...", "note": "..."}] }`. Falls back to plain-text summary if JSON parsing fails.
6. Calls `emit(runId, "review", { summary, issues, model: "haiku" })` — this persists the event in `agent_events` and broadcasts `run.event` to all clients.
7. `OrchestratedRunView.tsx` handles the new `review` event type: renders a bordered card with the summary and an optional collapsible issues list.

---

### 5.2 Affected Files

| File | Change |
|------|--------|
| **New** `src/server/agents/postRunReview.ts` | Core review logic (~65 lines): diff collection, truncation, Anthropic call, event emission |
| `src/server/agents/runEngine.ts` | Import and call `schedulePostRunReview(runId, cwd)` from `handleMessage` on `result.success`; the run's `cwd` must be passed through (currently available from `AgentRun`) |
| `src/client/components/OrchestratedRunView.tsx` | Add `review` branch to `EventView` rendering the summary card |

No DB schema changes. No new npm dependencies. No existing test changes required.

---

### 5.3 `postRunReview.ts` — Design

```typescript
// Called fire-and-forget from runEngine after a successful run.
// Computes the diff, runs a review, and emits a `review` event.
export async function schedulePostRunReview(runId: string, cwd: string): Promise<void>
```

**Diff collection logic:**
```
1. const diff = runDiff(cwd)           // working-tree vs HEAD (git.ts, already exists)
2. if diff.available && diff.files.length > 0 → use it
3. else → try execFileSync git diff HEAD~1..HEAD (last commit); parse with parseUnifiedDiff
4. if still empty → return (no changes to review; emit nothing)
```

**Truncation:** iterate `files`, accumulate `patch` text up to 6,000 chars, stop and note files omitted.

**Review prompt (system):**
> You are a senior engineer doing a concise code review of an AI agent's output. Review the diff below for correctness issues, security problems, and obvious mistakes. Reply with ONLY valid JSON matching this schema: `{"summary": "<1-2 sentence overall assessment>", "issues": [{"severity": "warn"|"info", "file": "<path>", "note": "<specific, actionable finding>"}]}`. If there are no issues, return an empty `issues` array.

**User message:** The truncated diff text.

**Error handling:** catch all errors silently (log to console, do not emit an error event — the run has already succeeded; a failed review must not retroactively signal failure).

---

### 5.4 `runEngine.ts` Change

The only change is in `handleMessage`:

```typescript
// Current:
if (msg.type === "result") {
  const summary = msg.subtype === "success" ? msg.result : `ended: ${msg.subtype}`;
  emit(runId, "result", { subtype: msg.subtype, text: summary });
  runsRepo.setSummary(runId, String(summary).slice(0, 800));
  runsRepo.setStatus(runId, msg.subtype === "success" ? "done" : "failed");
  return true;
}

// Change: add one line after the status is set to "done"
  if (msg.subtype === "success") void schedulePostRunReview(runId, cwd);
```

`handleMessage` currently takes `(runId: string, msg: SDKMessage)`. The `cwd` is not currently a parameter — it must be added. Both callers (`orchestrator.ts` and `agentRun.ts`) have access to `run.cwd` and pass it to their `handleMessage` calls in the loop.

**Exact signature change:**
```typescript
// Before:
export function handleMessage(runId: string, msg: SDKMessage): boolean

// After:
export function handleMessage(runId: string, msg: SDKMessage, cwd: string): boolean
```

Both `orchestrator.ts` and `agentRun.ts` call `handleMessage(run.id, msg)` — update both to `handleMessage(run.id, msg, run.cwd)`.

---

### 5.5 `OrchestratedRunView.tsx` Change

Add one case in `EventView`:

```tsx
if (event.type === "review") {
  const r = payload as { summary?: string; issues?: Array<{ severity: string; file: string; note: string }> };
  return (
    <div className="mb-4 rounded-md border border-accent/30 bg-accent-soft/20 px-3 py-2">
      <Mono>review</Mono>
      {r.summary && <p className="mt-1 text-[13px] leading-relaxed text-ink">{r.summary}</p>}
      {r.issues && r.issues.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {r.issues.map((issue, i) => (
            <li key={i} className="text-[12px] text-muted">
              <span className={issue.severity === "warn" ? "text-warn" : "text-faint"}>■</span>{" "}
              <Mono>{issue.file}</Mono>: {issue.note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

---

### 5.6 Dependencies

- `getAnthropic()` — already used in `agentRun.ts`, `orchestrator.ts`, `runTitle.ts`
- `runDiff()` — already exported from `git.ts`
- `emit()` — already exported from `runEngine.ts`
- `execFileSync` — already used in `git.ts`; imported in `postRunReview.ts`
- Model: `claude-haiku-4-5-20251001` — already a valid model; ~$0.001/review call

No new npm packages. No DB migrations. No env vars.

---

### 5.7 Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Review call fails (network, API key absent) | Low | Catch silently; do not emit error; run result is unaffected |
| `runDiff` returns empty on committed changes | Medium | Fallback to `git diff HEAD~1..HEAD` before giving up |
| Diff too large (binary files, generated code) | Medium | Binary files already skip in `runDiff`; cap at 6K chars; note truncation in prompt |
| LLM returns non-JSON response | Low | Parse best-effort; fall back to `{ summary: rawText, issues: [] }` |
| `handleMessage` signature change breaks callers | Very Low | Only two callers (`orchestrator.ts`, `agentRun.ts`); update both |
| Haiku model unavailable or deprecated | Very Low | Fall back to `DEFAULT_ORCH_MODEL` (Sonnet) with no behavioral change |

---

### 5.8 Validation Strategy

1. **Unit test** (`src/server/agents/postRunReview.test.ts`): mock `runDiff` and `getAnthropic().messages.create`; assert correct diff text construction, truncation at 6K chars, and event emission with expected shape.
2. **Unit test — empty diff**: when `runDiff` returns `{ available: true, files: [] }` and git diff HEAD~1 is also empty, assert no event is emitted.
3. **Integration (manual)**: delegate a ticket that produces a code change; confirm a `review` event appears in the Activity tab after the run completes.
4. **Regression**: run `npm test` — existing `handleMessage` tests must pass with the new `cwd` parameter.
5. **Type check**: `npm run typecheck` — confirm no type errors on the new `cwd` parameter across both callers.
6. **Lint**: `npm run lint` — zero errors.

### 5.9 Success Criteria

- `review` event appears in Activity feed for every successful orchestrated/coding-agent run that produced changes
- Empty-diff runs (clean working tree, no recent commit) emit no review event
- All existing tests pass
- No observable change to run completion timing (review is async, fire-and-forget)
- Typecheck and lint pass

---

*End of Run 2 — 2026-06-11*
