# FEATURE IMPROVEMENT ANALYSIS

> **Persistent ledger for nightly improvement runs.**
> Never delete prior entries. Append new ideas under their component, using the stable ID format below.
> Status values: `Proposed` | `Planned` | `Done`

---

## Run Log

| Run | Date | Ideas Added | Idea Selected |
|-----|------|-------------|---------------|
| 1 | 2026-06-07 | MA-001, MA-002, MA-003, OR-001, OR-002, OR-003, RT-001, SC-001, SC-002, SC-003, ME-001, ME-002, DF-001 | MA-002 |
| 2 | 2026-06-12 | FA-001, KA-001, OR-005, GH-001 | OR-001 |

---

## 1. Product Comprehension

### Vision

Mangled Agents is a local-first, single-package full-stack TypeScript workspace for a staff engineer to manage software projects and orchestrate Claude Code agents. The user talks to **Mangler** — a persistent chat agent — to track work, create kanban tickets, and delegate coding tasks to isolated sub-agents that edit files and execute commands on the local machine. Everything runs bound to `127.0.0.1`; there is no cloud dependency beyond the Anthropic API.

### Core Component Inventory (as of 2026-06-07)

| # | Component | Primary Files | Maturity | Key Gaps |
|---|-----------|--------------|----------|----------|
| 1 | **Mangler Chat Agent** | `src/server/agents/mangler.ts`, `manglerTools.ts` | High | 12-turn hard cap with no summarization; prompt caching applied (MA-002 done) but single merged block; full history accumulates |
| 2 | **Orchestrated Agent Runs** | `src/server/agents/orchestrator.ts`, `agentRun.ts` | High | Plan approval unlocks all tools globally; no token/cost metrics stored (0 visibility on spend); no run resume after failure |
| 3 | **PTY Terminal** | `src/server/agents/pty.ts`, `pty.serialize.ts` | Medium | No automatic reconnection; sessions marked stopped on server restart |
| 4 | **Kanban Board** | `src/server/db/tickets.ts`, `src/shared/board.ts` | Medium | Ticket status does not auto-update when an agent run completes on that ticket; no ticket→run link visible in UI |
| 5 | **Real-time Hub** | `src/server/realtime/hub.ts` | Low-Medium | No sequence numbers; no event buffering; client disconnect = all live events lost |
| 6 | **Definitions System** | `src/server/defs.ts`, `src/server/api/defs.ts` | Medium | No versioning; no diff history; no validation of definition schema |
| 7 | **Scheduling** | `src/server/scheduler.ts`, `src/server/cron.ts` | Low | 30 s polling; no retry on failure; no error column; missed runs silently skipped; no automatic GitHub source sync |
| 8 | **External Agent Chat** | `src/server/agents/externalAgentChat.ts`, `genie.ts` | Early | No streaming parity with Mangler; no tool-call transparency |
| 9 | **Memory (Honcho)** | `src/server/honcho.ts` | Low | Off by default; requires external SaaS; no local fallback; conversation history grows unbounded |
| 10 | **Agent Builder / Parallel Execution** | `src/server/agents/agentRun.ts`, `orchestrator.ts` | Medium | SDK v0.3.158 supports parallel sub-agents natively; Mangler can only delegate one ticket at a time |
| 11 | **GitHub Sync** | `src/server/github/sync.ts` | Low-Medium | Sync is entirely manual (no periodic trigger); a stale definition from a changed repo silently diverges |

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
- OTel GenAI v1.37+ (late 2025): shift from single-call LLM monitoring to agent-first observability. Key standardized attributes: `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.request.model`, `gen_ai.provider.name`, `gen_ai.operation.name` (tool_call / agent_run). Auto-instrumentation libraries exist for the Anthropic SDK. Under 1 ms per-call overhead. Cost calculation from token × model rate is the standard pattern.
  - Sources: [Datadog LLM Observability OTel support](https://www.datadoghq.com/blog/llm-otel-semantic-convention/) (2026); [OpenTelemetry AI Agent Observability blog](https://opentelemetry.io/blog/2025/ai-agent-observability/) (2025)
- Real-world impact: Multi-turn session tracing (not per-call) is the production unit; a "$47K runaway agent" incident (Nov 2025) accelerated adoption of per-run budget enforcement across the industry.
  - Source: [BuildMVPFast — Cost Tracking Multi-Model AI](https://www.buildmvpfast.com/blog/cost-tracking-multi-model-ai-token-usage-attribution-2026) (2026)

### 2.7 Parallel Sub-Agent Execution

**Key advances (2025–2026):**

- **Claude Agent SDK v0.3.158** (installed in this repo as of Run 2) natively supports parallel sub-agents via the `agents` parameter in `query()` options. The `Agent` tool (renamed from `Task` in v2.1.63) allows an orchestrator to spawn up to 10 concurrent sub-agents with context isolation. Fan-out/fan-in is a documented first-class pattern: split work to N sub-agents simultaneously, merge results in the time of the slowest one.
  - Sources: [Claude Agent SDK — Subagents docs](https://code.claude.com/docs/en/agent-sdk/subagents) (Anthropic official, 2026); [Anthropic Engineering — Building agents with the SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk) (Sept 2025)
- **Critical limitation:** Nested subagents are unsupported (do not pass `Agent` in a sub-agent's `tools` array). Each sub-agent runs in a fresh isolated context; intermediate tool calls stay isolated; only the final message returns to the parent.
- **Model selection per sub-agent:** Each sub-agent can override the parent model (`model: "haiku"` for reviewers, `model: "sonnet"` for implementers), enabling cost-tiered delegation.
  - Source: [Claude Agent SDK — Subagents docs](https://code.claude.com/docs/en/agent-sdk/subagents) (2026)
- **Message Batches API** (Anthropic, 2025): up to 100,000 requests per batch, 50% cost reduction on standard pricing, async processing (most batches complete < 1 hour). Complementary to the SDK for non-interactive bulk tasks.
  - Source: [Anthropic — Batch processing docs](https://platform.claude.com/docs/en/build-with-claude/batch-processing) (2025)

**Conflicts / caveats:** The `agents` SDK parameter is Anthropic-hosted; Databricks path cannot use it.

### 2.8 MCP Transport and Resumability

**Key advances (2025–2026):**

- **MCP Streamable HTTP transport** (protocol version 2025-11-25) consolidates bidirectional communication over a single HTTP POST endpoint with persistent response streams, superseding the deprecated SSE transport. An **EventStore** configuration enables resumability: clients reconnect with `Last-Event-ID`, and the server replays missed events. Critical for long-running tool calls to survive network hiatuses without requiring the LLM to restart.
  - Sources: [MCP Transports Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports); [The New Stack — MCP Streamable HTTP](https://thenewstack.io/how-mcp-uses-streamable-http-for-real-time-ai-tool-interaction/)
- **SQLite as append-only event store:** The `sql-event-store` pattern (append_key dedup + previous_id backward-link chain) is a validated production approach for edge deployments — directly applicable to the `agent_events` table already in this repo.
  - Source: [GitHub — sql-event-store](https://github.com/mattbishop/sql-event-store); [SoftwareMill — Message delivery and deduplication strategies](https://softwaremill.com/message-delivery-and-deduplication-strategies/)

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
- **Status:** Planned (Run 2 — 2026-06-12)
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

#### [OR-005] Post-Run Git Diff View
- **Date:** 2026-06-12
- **Status:** Proposed
- **Enabling advancement:** `src/server/git.ts` already exposes shell git commands; `DiffViewer` component already exists in the client
- **Gap addressed:** After an orchestrated run completes, users have no integrated view of what files the agent changed. They must open a terminal and run `git diff`. This breaks the "review the agent's work" step in the core value loop.
- **User benefit:** The run detail view shows a git diff of all changes made since the run started. Users can review file changes inline, understand exactly what the agent did, and commit or discard from the same interface.
- **Approach:** When a run transitions to `done`, capture the git diff from `run.cwd` via `git diff HEAD` (or compare against the commit sha recorded at run start, stored in a new `base_sha` column). Expose via `GET /api/runs/:id/diff`. Render using the existing `DiffViewer` component in `OrchestratedRunView.tsx`.
- **Affected files:** `src/server/git.ts`, `src/server/api/runs.ts`, `src/server/db/schema.ts` (optional `base_sha` column), `src/client/components/OrchestratedRunView.tsx`
- **Complexity:** Low-Medium (git diff is one shell command; `DiffViewer` already built; need a run-start sha capture)
- **Risk:** `git diff HEAD` shows unstaged changes; if the agent staged but didn't commit, a different diff command is needed. Must handle repos with no git history (new project path).

---

#### [FA-001] Parallel Fan-out Ticket Delegation
- **Date:** 2026-06-12
- **Status:** Proposed
- **Enabling advancement:** Claude Agent SDK v0.3.158 `agents` parameter enables up to 10 parallel sub-agent contexts; fan-out/fan-in documented as a first-class pattern (Anthropic Engineering, Sept 2025)
- **Gap addressed:** Mangler's `delegate_ticket` tool delegates one ticket per call, serialized. A sprint with five tickets requires five separate user instructions and five sequential delegations. Users cannot saturate available parallelism.
- **User benefit:** A single `delegate_sprint` call fans out up to N orchestrated runs simultaneously. A five-ticket sprint that takes 30 minutes serially completes in ~8 minutes (limited by the slowest run, not all five). Users ask "delegate the sprint" and all tickets are in flight.
- **Approach:** Add a `delegate_sprint` tool to `manglerTools.ts` that accepts a list of ticket IDs (max 8). Spawn parallel `startOrchestratedRun` calls (already async) via `Promise.all`. Each run is independent and follows the existing approval/plan flow. Return a list of `{ticketId, runId, status}` objects.
- **Affected files:** `src/server/agents/manglerTools.ts` (new `delegate_sprint` tool), `src/server/agents/mangler.ts` (add tool to anthropicTools)
- **Complexity:** Low-Medium (no new infrastructure; just parallelizing existing `startOrchestratedRun` calls; human-approval mode requires the UI to handle N simultaneous plan approval cards)
- **Risk:** N simultaneous orchestrated runs with `approver: "human"` would flood the user with plan approval prompts; should default `approver: "agent"` for batch delegation. Resource contention on the local machine (CPU/disk) from concurrent Claude Code agents.

---

### Component: Kanban Board

---

#### [KA-001] Ticket-to-Run Lifecycle Sync
- **Date:** 2026-06-12
- **Status:** Proposed
- **Enabling advancement:** `agent_runs.ticket_id` already links runs to tickets; run status transitions already emit `run.updated` events; `ticketsRepo.move()` already handles column moves
- **Gap addressed:** When a user asks Mangler to "work on this ticket," the kanban card stays in its current column regardless of run state. Users must manually move tickets through "In Progress" → "Review" → "Done." This breaks the core product loop: the board should reflect what the agents are actually doing.
- **User benefit:** The kanban board becomes a live dashboard of agent activity. Delegating a ticket auto-moves it to "In Progress"; a successful run moves it to "Review" (for human check); manual override still works since all moves are regular ticket moves.
- **Approach:**
  1. In `orchestrator.ts`, when the run transitions to `running` (after plan approval), find the associated ticket via `run.ticketId` and move it to the project's "in_progress" column (fall back to column index 2 if the column id doesn't exist).
  2. In `runEngine.ts`'s `handleMessage`, when `msg.type === "result"` and subtype is "success", move the ticket to the "review" column (fall back to column index 3). On failure, leave the ticket column unchanged but add a `failed` label.
  3. Broadcast `board.updated` after each move so the live board reflects the change immediately.
- **Affected files:** `src/server/agents/orchestrator.ts`, `src/server/agents/runEngine.ts`, `src/server/db/tickets.ts` (read-only, already imported), `src/server/db/projects.ts` (to resolve column ids)
- **Complexity:** Low (additive code in existing status-transition points; no new APIs or schema changes; broadcast already wired)
- **Risk:** If a user has manually moved a ticket ahead of the agent (e.g., already in "Review"), the lifecycle sync would move it back to "In Progress" on run start — a regression. Mitigation: only move if the ticket is currently in the "backlog" or "todo" column (don't move forward columns that are already further ahead).

---

### Component: GitHub Sync

---

#### [GH-001] GitHub Source Periodic Auto-Sync
- **Date:** 2026-06-12
- **Status:** Proposed
- **Enabling advancement:** `syncAll()` already exists in `src/server/github/sync.ts`; the scheduler's `tick()` pattern is established; cron infrastructure already present
- **Gap addressed:** GitHub source sync is purely manual (triggered only via the GitHub Sync page). A rule or skill updated in the source repo drifts silently until the user remembers to resync. In practice, users add a GitHub source and never sync it again.
- **User benefit:** Users configure an auto-sync interval per source (or a global `syncAll` schedule). Definitions stay current automatically without the user needing to think about it. Stale-source drift is eliminated.
- **Approach:** Add an optional `sync_interval_cron TEXT` column to `github_sources`. In `startScheduler()` (or a new `startGithubSyncScheduler()`), check for sources with a non-null `sync_interval_cron` and call `syncAll({ force: false })` when due. Alternatively, add a hardcoded background sync (e.g., every 6 hours) in `src/server/index.ts` using `setInterval`. The simpler path: a single `setInterval(syncAll, 6 * 60 * 60 * 1000)` in the server startup, configurable via a Settings toggle.
- **Affected files:** `src/server/index.ts` (add interval), `src/server/api/settings.ts` (toggle), `src/client/pages/SettingsPage.tsx` (UI)
- **Complexity:** Low (one `setInterval` call + a settings toggle; `syncAll` is already written and tested)
- **Risk:** GitHub rate-limits unauthenticated callers at 60 req/hour; `sync.ts` already notes this. A 6-hour background interval over a handful of sources is well within limits. If the user has many sources, the existing sequential sync strategy may be slow.

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

## Run 2 (2026-06-12)

### Selected: [OR-001] — Per-Run Token and Cost Tracking

**Justification against product objective:**

The product's orchestrated agent runs invoke the Claude Agent SDK and the Anthropic Messages API repeatedly; every run accumulates token spend that is currently invisible to the user. The `agent_runs` table stores the run record but no token counts. Users who delegate a complex ticket have no way to know whether it consumed $0.03 or $3.00.

Run 2's research adds significant weight to this:
1. The "$47K runaway agent" incident (Nov 2025) that accelerated industry adoption of per-run budget tracking — a real failure mode this product is exposed to.
2. OTel GenAI v1.37+ standardized `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens` as the baseline observability unit for any agentic system.
3. The Anthropic SDK already returns `usage` on every `Message` response; the Claude Agent SDK's `SDKMessage` for `assistant` type wraps the full `Message`, so `msg.message.usage` is available today in `runEngine.ts` without any SDK upgrade.

Compared to the other new ideas:
- **FA-001 (Parallel delegation)**: Higher impact ceiling but depends on fan-out UX design and run-approval flood-risk; correct to plan separately.
- **KA-001 (Lifecycle sync)**: Very low complexity and high UX value, but touches the "move tickets" logic with some risk of regressing manual moves; good for a later run.
- **OR-005 (Diff view)**: Complements token tracking but requires a `base_sha` capture concern; better after token tracking is in.
- **GH-001 (Auto-sync)**: Pure additive, low-risk, but lowest urgency.

OR-001 wins on the axis of **cost predictability** — an indispensable property for any tool that can autonomously spend API budget, and the one property that is entirely absent today.

---

## 6. Implementation Plan: [OR-001] Per-Run Token and Cost Tracking

**Objective:** Capture `input_tokens`, `output_tokens`, `cache_read_input_tokens`, and `cache_creation_input_tokens` from every assistant message during an orchestrated/agent run, accumulate per-run totals in SQLite, and surface a cost summary line in the run detail UI.

---

### 6.1 How Token Data Flows Today

The Claude Agent SDK emits `SDKMessage` objects from `query()`. For `msg.type === "assistant"`, `msg.message` is an Anthropic `Message` object, which carries a `usage` field:
```typescript
interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}
```
This data is already flowing through `runEngine.ts:handleMessage()` but is currently discarded. No new SDK calls, proxies, or external services are needed.

---

### 6.2 Affected Files

| File | Change |
|------|--------|
| `src/server/db/schema.ts` | Add migration block to ALTER TABLE `agent_runs` with four new integer columns |
| `src/server/db/runs.ts` | Add columns to `RunRow`; add to `toRun()`; add `addUsage()` accumulator method |
| `src/server/agents/runEngine.ts` | Extract `msg.message.usage` in `handleMessage` and call `runsRepo.addUsage()` |
| `src/shared/types.ts` | Add four token fields to the `AgentRun` Zod schema (with `.default(0)`) |
| `src/client/components/RunListDetail.tsx` | Add a token/cost summary line under the run result |

---

### 6.3 Schema Migration

SQLite supports `ALTER TABLE … ADD COLUMN` since version 3.1.3 (2005); Node 20+ ships SQLite ≥ 3.39, so `IF NOT EXISTS` on `ADD COLUMN` is available from 3.35+. Add a migration array to `src/server/db/index.ts` (or inline in `schema.ts`) that runs before the `CREATE TABLE IF NOT EXISTS` block:

```typescript
const COLUMN_MIGRATIONS = [
  "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS input_tokens INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS output_tokens INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS cache_read_tokens INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS cache_creation_tokens INTEGER NOT NULL DEFAULT 0",
];

// Run in db init, wrapped in a try/catch per statement to tolerate already-existing columns
// on databases that don't support IF NOT EXISTS.
for (const sql of COLUMN_MIGRATIONS) {
  try { db().prepare(sql).run(); } catch { /* column already exists */ }
}
```

---

### 6.4 DB Layer (`runs.ts`)

Add to `RunRow`:
```typescript
input_tokens: number;
output_tokens: number;
cache_read_tokens: number;
cache_creation_tokens: number;
```

Add to `toRun()`:
```typescript
inputTokens: r.input_tokens,
outputTokens: r.output_tokens,
cacheReadTokens: r.cache_read_tokens,
cacheCreationTokens: r.cache_creation_tokens,
```

New method on `runsRepo`:
```typescript
addUsage(id: string, input: number, output: number, cacheRead: number, cacheCreation: number): void {
  db()
    .prepare(
      `UPDATE agent_runs
       SET input_tokens = input_tokens + ?,
           output_tokens = output_tokens + ?,
           cache_read_tokens = cache_read_tokens + ?,
           cache_creation_tokens = cache_creation_tokens + ?
       WHERE id = ?`,
    )
    .run(input, output, cacheRead, cacheCreation, id);
},
```

---

### 6.5 runEngine.ts

In `handleMessage`, in the `msg.type === "assistant"` branch, after extracting blocks:

```typescript
const usage = (msg.message as { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }).usage;
if (usage) {
  runsRepo.addUsage(
    runId,
    usage.input_tokens ?? 0,
    usage.output_tokens ?? 0,
    usage.cache_read_input_tokens ?? 0,
    usage.cache_creation_input_tokens ?? 0,
  );
}
```

Cast is needed because `SDKMessage`'s TypeScript type may not yet expose `usage` in the public SDK typedefs; the runtime value is present on the underlying `Message` object.

---

### 6.6 Shared Types (`types.ts`)

In the `AgentRun` Zod schema, add:
```typescript
inputTokens: z.number().default(0),
outputTokens: z.number().default(0),
cacheReadTokens: z.number().default(0),
cacheCreationTokens: z.number().default(0),
```

---

### 6.7 UI (`RunListDetail.tsx`)

Add a cost summary function. Pricing for Claude Sonnet 4.6 (model `DEFAULT_ORCH_MODEL`):
- Input: $3.00 / 1M tokens → `$0.000003 / token`
- Output: $15.00 / 1M tokens → `$0.000015 / token`
- Cache read: $0.30 / 1M → `$0.0000003 / token`
- Cache creation: $3.75 / 1M → `$0.000003750 / token`

Use these as a single-model estimate; display "~$X.XX" to signal approximation. Do not store pricing in the DB (it would rot); compute at display time. Only show the cost line when at least one token field is non-zero.

```typescript
function formatTokens(run: AgentRun): string | null {
  const total = run.inputTokens + run.outputTokens;
  if (!total) return null;
  const cost =
    run.inputTokens * 0.000003 +
    run.outputTokens * 0.000015 +
    run.cacheReadTokens * 0.0000003 +
    run.cacheCreationTokens * 0.00000375;
  return `${(run.inputTokens + run.cacheReadTokens).toLocaleString()} in · ${run.outputTokens.toLocaleString()} out · ~$${cost.toFixed(3)}`;
}
```

Display as a small `<Mono>` line in the run header section of `RunListDetail.tsx`.

---

### 6.8 Dependencies

- No new npm packages
- No new environment variables
- SQLite ALTER TABLE — safe on Node 20+ (SQLite 3.39+)

---

### 6.9 Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `SDKMessage` TypeScript type does not expose `usage` | Medium | Cast to `unknown` then to the expected shape; runtime value is present on the `Message` object regardless of typedef coverage |
| Existing DB installations lack the new columns | Low | Migration block runs on every startup; `IF NOT EXISTS` is idempotent |
| Pricing constants go stale | Medium | Display "~$X" to signal approximation; add a comment linking to Anthropic pricing docs so future maintainers know to update |
| Agentless runs (PTY) have no SDK usage → tokens stay 0 | Low | Acceptable; PTY runs don't use the Anthropic SDK directly; display nothing for PTY runs |
| `addUsage` race condition on concurrent runs | Very Low | Each run has a unique `id`; SQLite serializes writes; `UPDATE ... SET x = x + ?` is atomic |

---

### 6.10 Validation Strategy

1. **Unit test:** In `src/server/db/runs.ts` test, call `addUsage` twice and assert the accumulated totals are the sum.
2. **Integration test (manual):** Delegate a ticket; after the run completes, inspect `agent_runs` in SQLite: `SELECT input_tokens, output_tokens FROM agent_runs ORDER BY created_at DESC LIMIT 1;` — expect non-zero values.
3. **UI test:** Verify the cost line appears in `RunListDetail` for a completed run; verify it does not appear for a PTY run (tokens stay at 0).
4. **Regression:** `npm test` must pass; `npm run typecheck` and `npm run lint` must pass.

---

### 6.11 Success Criteria

- `input_tokens` and `output_tokens` are non-zero on completed orchestrated/agent runs
- Cost summary line renders correctly in the run detail view
- All existing tests pass
- Typecheck and lint pass
- No behavioral change in run execution or approval flow

---

*End of Run 2 — 2026-06-12*
