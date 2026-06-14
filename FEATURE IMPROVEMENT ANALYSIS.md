# FEATURE IMPROVEMENT ANALYSIS

> **Persistent ledger for nightly improvement runs.**
> Never delete prior entries. Append new ideas under their component, using the stable ID format below.
> Status values: `Proposed` | `Planned` | `Done`

---

## Run Log

| Run | Date | Ideas Added | Idea Selected |
|-----|------|-------------|---------------|
| 1 | 2026-06-07 | MA-001, MA-002, MA-003, OR-001, OR-002, OR-003, RT-001, SC-001, SC-002, SC-003, ME-001, ME-002, DF-001 | MA-002 |
| 2 | 2026-06-14 | KB-001, KB-002, MCP-001, MCP-002, MA-004, GH-001 | KB-001 |

---

## 1. Product Comprehension

### Vision

Mangled Agents is a local-first, single-package full-stack TypeScript workspace for a staff engineer to manage software projects and orchestrate Claude Code agents. The user talks to **Mangler** — a persistent chat agent — to track work, create kanban tickets, and delegate coding tasks to isolated sub-agents that edit files and execute commands on the local machine. Everything runs bound to `127.0.0.1`; there is no cloud dependency beyond the Anthropic API.

### Core Component Inventory (as of 2026-06-07)

| # | Component | Primary Files | Maturity | Key Gaps |
|---|-----------|--------------|----------|----------|
| 1 | **Mangler Chat Agent** | `src/server/agents/mangler.ts`, `manglerTools.ts` | High | 12-turn hard cap with no summarization; no prompt caching (fixed Run 1); full message history sent each turn; no conversation search |
| 2 | **Orchestrated Agent Runs** | `src/server/agents/orchestrator.ts` | High | Plan approval unlocks all tools globally; no token/cost metrics stored; no run resume after failure; ticket not auto-advanced on completion |
| 3 | **Local Agent Runs** | `src/server/agents/agentRun.ts`, `src/server/db/agents.ts` | Medium | Task agents have no feedback when bound to a ticket; no auto-advance of ticket on completion |
| 4 | **PTY Terminal** | `src/server/agents/pty.ts`, `pty.serialize.ts` | Medium | No automatic reconnection; sessions marked stopped on server restart |
| 5 | **Kanban Board** | `src/server/db/tickets.ts`, `src/shared/board.ts` | Medium | Ticket→run link exists (`agent_runs.ticket_id`) but run completion never advances ticket column; no ticket decomposition; no blocking relationships |
| 6 | **Real-time Hub** | `src/server/realtime/hub.ts` | Low-Medium | `agent_events.seq` is populated per-run (verified) but hub broadcasts carry no seq; client disconnect = all live events lost |
| 7 | **Definitions System** | `src/server/defs.ts`, `src/server/api/defs.ts` | Medium | No versioning; no diff history; no validation of definition schema |
| 8 | **GitHub Integration** | `src/server/github/`, `src/server/db/githubSources.ts` | Early-Medium | Pulls rules/skills from public GitHub repos only (no auth); additive-only sync; no bidirectional push; no webhook-based triggers |
| 9 | **MCP Servers** | `src/server/agents/mcp.ts`, `src/server/db/mcpServers.ts` | Medium | Process-level connection cache only; no health monitoring; no auto-discovery; servers only fail-visible on use |
| 10 | **Scheduling** | `src/server/scheduler.ts`, `src/server/cron.ts` | Low | 30 s polling; no retry on failure; no error column; missed runs silently skipped |
| 11 | **External Agent Chat** | `src/server/agents/externalAgentChat.ts`, `genie.ts` | Early | No streaming parity with Mangler; no tool-call transparency |
| 12 | **Memory (Honcho)** | `src/server/honcho.ts` | Low | Off by default; requires external SaaS; no local fallback; conversation history grows unbounded |

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

## Run 2 — 2026-06-14

### 2. Frontier Research Findings (Run 2)

#### 2.7 Agentic Kanban and Ticket Lifecycle Automation

**Key advances (2025–2026):**

- **AIF Handoff** (GitHub, 2026): Autonomous kanban where tasks flow Backlog → Planning → Plan Ready → Implementing → Review → Done, each stage driven by a specialized AI subagent. Stage transitions happen automatically on agent completion.
  - Source: [GitHub — lee-to/aif-handoff](https://github.com/lee-to/aif-handoff)
- **Agent-Kanban** (GitHub, 2026): Daemon polls assigned tasks, sets up worktrees, and spawns a worker agent per task; on success, advances the card. Workers are released back to a pool.
  - Source: [GitHub — saltbo/agent-kanban](https://github.com/saltbo/agent-kanban)
- **Hermes Kanban** (May 2026): Supports automatic and manual task decomposition; agents propose sub-cards from a high-level ticket; CI/CD integration closes the loop.
  - Source: [magnus919.com — Hermes Kanban, May 2026](https://magnus919.com/2026/05/the-hermes-kanban-a-complete-guide-to-multi-agent-task-orchestration/)
- **Empirical failure patterns**: Among AI-generated PRs, reviewer-level abandonment (38%) and CI failure (17%) are dominant. Auto-advancing to a "Review" column is the bridge between agent output and human review.
  - Source: [arxiv.org — Where Do AI Coding Agents Fail, 2601.15195](https://arxiv.org/pdf/2601.15195)
- **Codebase confirmation**: `agent_runs.ticket_id` (FK to `tickets`), `ticketsRepo.move(id, columnId, position)`, and `appendPosition()` are all in place. Run completion already broadcasts `run.updated`. Ticket advancement requires zero schema changes.
  - Source: VERIFIED — `src/server/db/tickets.ts`, `src/shared/board.ts`, `src/shared/types.ts` (DEFAULT_COLUMNS: backlog → todo → in_progress → review → done)

#### 2.8 MCP Ecosystem: Discovery and Health

**Key advances (2025–2026):**

- **`.well-known/mcp.json` auto-discovery** (2026 MCP roadmap): Standardized server discovery so clients can auto-configure by fetching a well-known URL. Eliminates manual transport/command/URL entry for remote servers.
  - Sources: [ekamoira.com — MCP Server Discovery 2026](https://www.ekamoira.com/blog/mcp-server-discovery-implement-well-known-mcp-json-2026-guide); [tedt.org — MCP 2026 Roadmap](https://tedt.org/MCPs-2026-Roadmap/)
- **OAuth 2.1 for remote MCP servers** (spec): Remote MCP servers on HTTP/SSE now mandate OAuth 2.1 with PKCE S256, RFC 9728 Protected Resource Metadata, and RFC 7591 Dynamic Client Registration.
  - Source: [workos.com — MCP in 2026](https://workos.com/blog/everything-your-team-needs-to-know-about-mcp-in-2026)
- **MCP health gap**: No standard audit log or health signal from MCP servers. Production deployments need per-server status visibility; failed servers currently only surface on use (confirmed in `mcp.ts`).
  - Sources: [prefect.io — Best MCP Deployment Platforms 2026](https://www.prefect.io/resources/best-mcp-deployment-platforms-enterprise-2026); VERIFIED — `src/server/agents/mcp.ts` `invalidateMcpServer()` only called reactively
- **500+ public MCP servers** as of early 2026, governed by Linux Foundation / Agentic AI Foundation since Dec 2025.
  - Source: [sitepoint.com — MCP Complete 2026 Guide](https://www.sitepoint.com/model-context-protocol-mcp/)

#### 2.9 SQLite Hybrid Search for Agent Memory

**Key advances (2025–2026):**

- **FTS5 + vector hybrid** (2026): SQLite FTS5 full-text search combined with cosine vector similarity (via `sqlite-vec` or BLOBs) consistently outperforms single-signal retrieval. Reciprocal Rank Fusion merges both scores.
  - Sources: [earezki.com — SQLite+FTS5 vs Vector DBs, Apr 2026](https://earezki.com/ai-news/2026-04-08-why-sqlitefts5-beats-vector-dbs-for-ai-agent-memory/); [zeroclaws.io — ZeroClaw Hybrid Memory](https://zeroclaws.io/blog/zeroclaw-sqlite-fts5-vector-hybrid-memory-explained/)
- **BrainDB** (2026): 4,300+ memories at sub-1ms latency using 384-dim vector BLOBs + BM25 ranking.
  - Source: [earezki.com — SQLite+FTS5 vs Vector DBs](https://earezki.com/ai-news/2026-04-08-why-sqlitefts5-beats-vector-dbs-for-ai-agent-memory/)
- **FTS5-only path**: For keyword search across conversation history, FTS5 alone (no embeddings, no external model) provides immediate value at zero cost, zero latency, and zero new dependencies. `better-sqlite3` ships with FTS5 support via SQLite's built-in extension.
  - Source: [gist.github.com — FTS5 conversation memory](https://gist.github.com/betoneh/79006333939dc2433e5e2f30428dd615); DEDUCED from `better-sqlite3` docs.

#### 2.10 Claude Agent Teams (Released Feb 2026)

**Key advances:**

- **Claude Agent Teams** released Feb 5, 2026 (alongside Opus 4.6): multiple sessions coordinate as a team with a shared task list, direct teammate-to-teammate messaging, and a lead orchestrator. Multi-agent architectures measured at up to 90% higher benchmark scores than single-agent when properly parallelized.
  - Sources: [cloudzero.com — Claude Code Agents 2026](https://www.cloudzero.com/blog/claude-code-agents/); [alexop.dev — Agent Teams](https://alexop.dev/posts/from-tasks-to-swarms-agent-teams-in-claude-code/)
- **Pricing change (June 15, 2026)**: Agent SDK usage draws from a monthly Agent SDK credit pool separate from interactive limits. This increases cost visibility pressure for orchestrated runs.
  - Source: [cloudzero.com — Claude Code Agents 2026](https://www.cloudzero.com/blog/claude-code-agents/)
- **Conflict**: Agent Teams are experimental; production stability and SDK contract are unconfirmed for embedding in orchestrated runs. Marked as PATTERN — matches documented SDK roadmap but not independently verified in the current `@anthropic-ai/claude-agent-sdk` release.

#### 2.11 GitHub Agentic Workflows (Technical Preview, Feb 2026)

**Key advances:**

- **GitHub Agentic Workflows** (technical preview, Feb 13, 2026): Markdown files in `.github/workflows/` describe automation goals; the `gh aw` CLI converts them to standard Actions workflows. Default read-only permissions; write ops use preapproved "safe outputs." Covers issue triage, PR review, CI failure analysis.
  - Source: [github.blog — GitHub Agentic Workflows](https://github.blog/ai-and-ml/automate-repository-tasks-with-github-agentic-workflows/)
- **Inbound webhook pattern**: An agent in GitHub Actions that calls an external webhook (or MCP server) on PR merge / CI failure is now a first-class GitHub pattern. This is the missing bridge between Mangled Agents and repository events.
  - Source: [prompt2bot.com — AI PR Review GitHub Workflow](https://prompt2bot.com/blog/ai-pr-review-github-workflow)
- **Conflict / caveat**: Agentic Workflows are in technical preview; the `gh aw` CLI is not GA and the API surface may change.

---

### 3. New Ideas (Run 2)

---

### Component: Kanban Board

---

#### [KB-001] Automated Ticket Stage Transition on Run Completion
- **Date:** 2026-06-14
- **Status:** Planned
- **Enabling advancement:** AIF Handoff / Agent-Kanban autonomous stage transition pattern (2026); `ticketsRepo.move()` and `appendPosition()` already present; `agent_runs.ticket_id` FK already populated on delegation
- **Gap addressed:** When an orchestrated or agent run linked to a ticket completes successfully, the ticket stays in its current column. The user must manually drag it to "Review" or "Done." This breaks the agentic loop — the whole point of delegation is to advance work automatically.
- **User benefit:** The kanban board reflects actual work state without human intervention. A run completing successfully moves the ticket one column forward (e.g., In Progress → Review), surfacing it for human review exactly where reviewers expect it. A failed/stopped run leaves the ticket unmoved and visibly at risk.
- **Approach:** Add an `advanceTicketOnRunSuccess(run: AgentRun)` helper in `src/server/agents/runEngine.ts`. It reads `run.ticketId` and `run.projectId`; if both are set, loads the ticket and project, finds the current column index in `project.columns`, and if there is a next column calls `ticketsRepo.move(ticket.id, nextColumn.id, appendPosition(...))`. Then broadcasts `{ type: "board.updated", projectId }`. Call this helper at the end of `startOrchestratedRun` and `startAgentRun` when the final status is `"done"`.
- **Affected files:** `src/server/agents/runEngine.ts` (new helper), `src/server/agents/orchestrator.ts` (call site), `src/server/agents/agentRun.ts` (call site)
- **Complexity:** Low (no schema changes, no new dependencies, ~40 lines total)
- **Risk:** Users with custom column orders need the project's actual `columns` array (not the DEFAULT_COLUMNS constant) — must load from `projectsRepo`; already available via `run.projectId`. Edge case: ticket already in the last column must not wrap.

---

#### [KB-002] Mangler "Decompose Ticket" Tool
- **Date:** 2026-06-14
- **Status:** Proposed
- **Enabling advancement:** Hermes Kanban decomposition pattern (May 2026); Mangler's `manglerTools.ts` tool system already supports structured tool definitions
- **Gap addressed:** High-level tickets ("Build the auth system") are too coarse for a single agent run. Users manually break them into sub-tickets, a slow and error-prone process.
- **User benefit:** Mangler can propose a decomposition of a ticket into 3–6 sub-tickets, each scoped to a single agent run. User reviews and confirms. Sub-tickets are created in the Backlog column automatically.
- **Approach:** Add a `decompose_ticket` tool to `manglerTools.ts` that accepts `ticketId` and calls the LLM to generate sub-ticket titles/bodies, then calls `ticketsRepo.create()` for each. Return a summary to the user.
- **Affected files:** `src/server/agents/manglerTools.ts`, `src/server/db/tickets.ts`
- **Complexity:** Medium (LLM call in the tool, multiple DB writes, idempotency concern)
- **Risk:** LLM may generate poor decompositions; needs user confirmation step before creation

---

### Component: MCP Servers

---

#### [MCP-001] MCP Server Health Monitoring
- **Date:** 2026-06-14
- **Status:** Proposed
- **Enabling advancement:** Production MCP deployment best practices 2026 (Prefect); connection cache already in `mcp.ts`; `invalidateMcpServer()` called reactively on error
- **Gap addressed:** MCP server failures are invisible until a Mangler turn tries to use the server and the error is swallowed with `console.error`. Users have no way to see which servers are healthy without checking logs.
- **User benefit:** The MCP Servers page shows a status badge (Connected / Error / Unknown) and last error message per server. A "Test" button forces a check. No silent failures.
- **Approach:** Add `last_status TEXT`, `last_error TEXT`, `last_checked_at INTEGER` columns to `mcp_servers` schema. On server start (and after any `invalidateMcpServer` call), run `testMcpServer()` in the background; write result to DB; broadcast `mcpServer.statusUpdated`. Surface in `McpServersPage.tsx`.
- **Affected files:** `src/server/agents/mcp.ts`, `src/server/db/schema.ts`, `src/server/db/mcpServers.ts`, `src/client/pages/McpServersPage.tsx`
- **Complexity:** Low-Medium (schema migration, background probe, UI badge)
- **Risk:** Probing stdio servers spawns a process; must be careful about resource usage at startup if many servers are configured

---

#### [MCP-002] MCP Server Auto-Discovery via `.well-known/mcp.json`
- **Date:** 2026-06-14
- **Status:** Proposed
- **Enabling advancement:** Emerging 2026 MCP `.well-known/mcp.json` discovery standard (Anthropic/Linux Foundation roadmap; Ekamoira.com guide)
- **Gap addressed:** Adding a remote MCP server requires manually entering transport type, URL, and auth headers. The 2026 discovery standard allows a host to publish its server config at `https://host/.well-known/mcp.json`; clients can auto-import it.
- **User benefit:** User pastes a base URL (e.g., `https://my-mcp-server.example.com`); the app fetches `/.well-known/mcp.json`, parses the config, and pre-fills the add-server form. One click instead of five fields.
- **Approach:** Add a "Discover" input to `McpServersPage.tsx`. On submit, POST to `/api/mcp-servers/discover` with the base URL; the server fetches `/.well-known/mcp.json`, validates the schema, and returns a pre-populated server config. The client pre-fills the creation form.
- **Affected files:** `src/server/api/mcpServers.ts` (new `/discover` endpoint), `src/client/pages/McpServersPage.tsx`
- **Complexity:** Low (HTTP fetch + JSON parse + form pre-fill; no schema change)
- **Risk:** `.well-known/mcp.json` schema is not yet ratified; may need to handle multiple draft formats; SSRF risk on the server-side fetch (must restrict to http/https, no localhost/internal ranges)

---

### Component: Mangler Chat Agent

---

#### [MA-004] Full-Text Conversation Search via SQLite FTS5
- **Date:** 2026-06-14
- **Status:** Proposed
- **Enabling advancement:** SQLite FTS5 built into `better-sqlite3` at zero cost; BrainDB/ZeroClaw 2026 hybrid search patterns; no embedding required for keyword search
- **Gap addressed:** There is no search across Mangler conversations. A user who remembers discussing a ticket or a decision made in a past session has no way to retrieve it. The `messages` table has no FTS index.
- **User benefit:** A search input in `ManglerPage.tsx` (or a global search bar) lets users find past conversations by keyword, immediately filtered and ranked by relevance. Zero latency, zero cost, zero new dependencies.
- **Approach:** Create an FTS5 virtual table `messages_fts(content, content_rowid)` mirroring the `messages` table text content. Populate via triggers on insert/update/delete. Add `/api/mangler/search?q=...` endpoint that runs `SELECT * FROM messages_fts WHERE messages_fts MATCH ?` with `bm25()` ranking. Return matching conversation IDs + snippets.
- **Affected files:** `src/server/db/schema.ts` (FTS5 virtual table + triggers), `src/server/api/mangler.ts` (new search endpoint), `src/client/pages/ManglerPage.tsx` (search UI)
- **Complexity:** Low-Medium (FTS5 DDL is ~10 lines; search API is ~20 lines; UI is a controlled input)
- **Risk:** FTS5 content tables with triggers add ~1–2ms to every message insert; negligible at this scale. Snippet generation requires `snippet()` function — well-supported in FTS5.

---

### Component: GitHub Integration

---

#### [GH-001] GitHub Agentic Workflow Webhook Receiver
- **Date:** 2026-06-14
- **Status:** Proposed
- **Enabling advancement:** GitHub Agentic Workflows technical preview (Feb 2026) — CI failure, PR merge, issue creation can trigger outbound webhooks; SC-002 (Event-Driven Triggers, Proposed) covers the server-side half
- **Gap addressed:** Mangled Agents can only be triggered manually or on a cron schedule. There is no way for a GitHub repository event (CI failure, PR merged, issue labeled) to automatically start a Mangler conversation or agent run.
- **User benefit:** "Whenever the test suite fails on main, ask Mangler to triage the failure" becomes a one-time GitHub webhook configuration. Closes the loop between repository activity and the local agent workspace.
- **Approach:** Add a signed webhook receiver at `/api/github/webhook` (HMAC-SHA256 signature verification with a user-configured secret). Parse the event type (`workflow_run`, `pull_request`, `issues`) and map it to a `fireSchedule`-compatible call: create or reuse a conversation and inject a prompt describing the event. Expose webhook URL + secret in Settings.
- **Affected files:** `src/server/api/github.ts` (new webhook handler), `src/server/env.ts` (webhook secret), `src/client/pages/SettingsPage.tsx` (webhook URL display)
- **Complexity:** Medium (HMAC verification, event dispatch, prompt templating per event type)
- **Risk:** Requires user to configure a GitHub webhook with the correct secret; HMAC verification must be constant-time to prevent timing attacks; runs triggered by webhooks need rate limiting to prevent runaway agent costs

---

## 4. Improvement Selection (Run 2)

### Selected: [KB-001] — Automated Ticket Stage Transition on Run Completion

**Justification against product objective:**

The product's central promise is a closed loop: the user talks to Mangler → work items appear on the board → agents execute and advance the work. Today the loop is broken at the last step. When a run completes — whether orchestrated or agent-type — the linked ticket stays exactly where it was. The user must manually drag it to "Review" or "Done." This is friction that directly contradicts the "orchestrate while I'm away" value proposition.

KB-001 closes that gap with the minimum possible code. The entire required infrastructure already exists: `agent_runs.ticket_id` links runs to tickets; `ticketsRepo.move()` and `appendPosition()` handle the move; `project.columns` carries the ordered column list; `broadcast()` notifies clients. The change adds one helper function and two call sites — approximately 40 lines — with no schema migration, no new dependency, and no behavioral risk to existing runs (runs without a ticket ID are a no-op).

The pattern is validated by AIF Handoff, Agent-Kanban, and Hermes Kanban as table-stakes behavior in 2026 agentic development tools. The empirical finding that 38% of agent-generated PRs suffer reviewer-level abandonment underscores that the transition to "Review" must be automatic — if reviewers don't see it, they don't act.

**Ideas excluded this run:**
- RT-001 (Reconnection replay): High value and well-founded — the `agent_events.seq` column is confirmed populated — but medium complexity. Carry forward.
- MA-004 (FTS5 search): High value, low complexity, but adds a UI surface that benefits from a design review. Carry forward.
- MCP-001 (Health monitoring): Good operational improvement; lower urgency than closing the core agentic loop.
- KB-002 (Ticket decomposition): Good, but depends on KB-001 closing the loop first.
- GH-001 (Webhook receiver): Overlaps with SC-002 (Event-Driven Triggers, Proposed); should be scoped together.
- MCP-002 (Auto-discovery): Low complexity but the `.well-known/mcp.json` spec is not yet ratified.

---

## 5. Implementation Plan: [KB-001] Automated Ticket Stage Transition

**Objective:** When an orchestrated or agent-type run that is linked to a ticket completes with status `"done"`, automatically advance the ticket to the next column in the project's column order.

### 5.1 Data Model (Verified — No Schema Changes Required)

| Entity | Field | Role |
|--------|-------|------|
| `agent_runs` | `ticket_id TEXT` | FK to `tickets.id`; set when Mangler delegates a ticket |
| `agent_runs` | `project_id TEXT` | FK to `projects.id` |
| `tickets` | `column_id TEXT` | Current column |
| `projects` | `columns_json TEXT` | Ordered `Column[]` array — source of truth for progression |
| `ticketsRepo` | `.move(id, columnId, position)` | Persists the column change |
| `appendPosition(positions)` | — | Computes position at end of target column |

### 5.2 New Helper: `advanceTicketOnRunSuccess`

Location: `src/server/agents/runEngine.ts` (the shared plumbing file — already imports `runsRepo` and `broadcast`; add `ticketsRepo` and `projectsRepo` imports).

```typescript
// Advance the ticket linked to `run` by one column when the run succeeds.
// No-op if the run has no ticket, the ticket is already in the last column,
// or either the ticket or project can't be loaded.
export async function advanceTicketOnRunSuccess(run: AgentRun): Promise<void> {
  if (!run.ticketId || !run.projectId) return;
  const ticket = ticketsRepo.get(run.ticketId);
  const project = projectsRepo.get(run.projectId);
  if (!ticket || !project) return;
  const idx = project.columns.findIndex((c) => c.id === ticket.columnId);
  if (idx === -1 || idx === project.columns.length - 1) return;
  const nextColumn = project.columns[idx + 1];
  const positions = ticketsRepo
    .listByProject(project.id)
    .filter((t) => t.columnId === nextColumn.id)
    .map((t) => t.position);
  ticketsRepo.move(ticket.id, nextColumn.id, appendPosition(positions));
  broadcast({ type: "board.updated", projectId: project.id });
}
```

### 5.3 Call Sites

**`src/server/agents/orchestrator.ts`** — add after `runsRepo.setStatus(run.id, "done")`:
```typescript
const finalRun = runsRepo.get(run.id);
if (finalRun?.status === "done") await advanceTicketOnRunSuccess(finalRun);
```

**`src/server/agents/agentRun.ts`** — same pattern at the end of `startAgentRun`:
```typescript
const finalRun = runsRepo.get(run.id);
if (finalRun?.status === "done") await advanceTicketOnRunSuccess(finalRun);
```

### 5.4 Affected Files

| File | Change |
|------|--------|
| `src/server/agents/runEngine.ts` | New `advanceTicketOnRunSuccess` export; add `ticketsRepo`, `projectsRepo`, `appendPosition` imports |
| `src/server/agents/orchestrator.ts` | One call at successful completion |
| `src/server/agents/agentRun.ts` | One call at successful completion |

No client changes, no schema migration, no new dependencies.

### 5.5 Shared WS Message

`board.updated` is already in the `ws.ts` contract (confirmed by `broadcast({ type: "github.sources.updated" })` pattern). The client's board page already re-fetches on board-related events. No client changes required.

### 5.6 Edge Cases and Risks

| Scenario | Handling |
|----------|----------|
| Run has no `ticketId` | Early return — no-op |
| Ticket already in last column | `idx === project.columns.length - 1` guard — no wrap |
| Project deleted between run start and completion | `projectsRepo.get` returns `undefined` — early return |
| User has custom column order | Uses `project.columns` (DB-stored per project) — correct |
| `ticketsRepo.move` fails (e.g., concurrent delete) | Exception propagates to caller; run status is already `"done"` — log only |
| Run fails or is stopped | `advanceTicketOnRunSuccess` is only called on `"done"` status — ticket unmoved |

### 5.7 Validation Strategy

1. **Unit test** (`src/server/agents/runEngine.ts` or new `ticketSync.test.ts`): mock `ticketsRepo`, `projectsRepo`, `broadcast`; verify `move` is called with the correct next column; verify no-op cases (no ticket, last column, unknown column).
2. **Integration test (manual)**: Create a project, add a ticket in "In Progress", start an orchestrated run linked to that ticket, let it complete, confirm the ticket appears in "Review" without a manual drag.
3. **Edge case manual test**: Ticket in "Done" (last column) — confirm no wrap after a successful run.
4. **Regression**: `npm test` — confirm existing orchestrator and agentRun tests pass. The new call only fires when status is `"done"` and is async/non-blocking relative to existing test mock structures.
5. **Lint and typecheck**: `npm run lint && npm run typecheck` must pass.

### 5.8 Success Criteria

- Unit tests pass for all cases including edge cases
- Manual demo: ticket advances one column on run `"done"`
- Failed/stopped runs leave ticket unchanged
- Runs without a ticket link are unaffected
- All existing tests pass
- Lint and typecheck clean

---

*End of Run 2 — 2026-06-14*
