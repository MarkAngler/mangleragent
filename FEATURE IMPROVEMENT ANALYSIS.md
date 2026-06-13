# FEATURE IMPROVEMENT ANALYSIS

> **Persistent ledger for nightly improvement runs.**
> Never delete prior entries. Append new ideas under their component, using the stable ID format below.
> Status values: `Proposed` | `Planned` | `Done`

---

## Run Log

| Run | Date | Ideas Added | Idea Selected |
|-----|------|-------------|---------------|
| 1 | 2026-06-07 | MA-001, MA-002, MA-003, OR-001, OR-002, OR-003, RT-001, SC-001, SC-002, SC-003, ME-001, ME-002, DF-001 | MA-002 |
| 2 | 2026-06-13 | OR-005, MA-004, MA-005, RT-002, SC-004 | OR-001 |

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

*(Run 1 findings retained above; new findings from Run 2 begin at 2.7.)*

---

### 2.7 Claude Agent SDK — Cost Tracking API (Run 2, 2026-06-13)

**Verified from official SDK documentation (code.claude.com/docs/en/agent-sdk/cost-tracking):**

- The TypeScript Agent SDK exposes token usage at two granularities:
  - **Per-step:** each `assistant` message carries `message.message.usage` (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`). Parallel tool calls within one step share the same `message.message.id` — deduplicate by ID to avoid double-counting.
  - **Per-query total:** the `result` message carries `message.total_cost_usd` (cumulative estimated USD cost) and `message.modelUsage` (map of model name → `{ costUSD, inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens }`).
- `total_cost_usd` is a client-side estimate from a bundled price table. For authoritative billing, the Usage and Cost API or the Claude Console is the ground truth.
- **June 15, 2026 billing change (VERIFIED):** Agent SDK usage now bills against a separate monthly credit pool at API list prices ($3/M input tokens, $15/M output tokens for Sonnet class). Pro plan: $20/month of SDK credit; Max 5×: $100. Agentic runs consume ~7× more tokens than single-prompt sessions.
  - Sources: [Claude Agent SDK Billing Split](https://claudcod.com/blog/claude-agent-sdk-billing-split/); [Track cost and usage](https://code.claude.com/docs/en/agent-sdk/cost-tracking); [Tracking Costs and Usage](https://docs.claude.com/en/api/agent-sdk/cost-tracking)
- **Current codebase gap:** `runEngine.ts:handleMessage()` processes `result` messages but reads only `msg.result` (summary text) and ignores `msg.total_cost_usd` and `msg.modelUsage`. Zero cost data is stored or displayed anywhere.

**Conflict note:** `total_cost_usd` is described as an estimate that can drift from actual billing. Using it for display purposes (not billing) is safe; flag in the UI that it is an estimate.

---

### 2.8 Prompt Cache TTL Extension for Orchestrated Runs (Run 2, 2026-06-13)

**Verified from official SDK documentation (code.claude.com/docs/en/agent-sdk/cost-tracking):**

- Cache writes by the Agent SDK default to a **5-minute TTL** when using an API key.
- Setting `ENABLE_PROMPT_CACHING_1H=1` in the options `env` object upgrades cache writes to a **1-hour TTL**.
- Cost trade-off: 1-hour cache writes are billed at a higher write rate than 5-minute writes; the break-even is any session where the same context would otherwise be re-cached more than once within an hour.
- Typical orchestrated runs in this codebase run for several minutes to tens of minutes — well within the 5-minute TTL expiry risk window. A run that takes 8 minutes and has a cache miss at minute 6 pays a full re-cache write mid-run.
  - Source: [Track cost and usage](https://code.claude.com/docs/en/agent-sdk/cost-tracking)
- **Subscription plan users** (Claude Pro/Max) already receive 1-hour TTL automatically without this variable.

---

### 2.9 Context Compression without Paraphrase (Run 2, 2026-06-13)

**Key advances:**

- **Compression without paraphrase** (Morph Compact): achieves 50–70% context reduction where every surviving sentence is verbatim from the original (98% verbatim accuracy). Contrast with summarization (MA-001), which paraphrases and can lose precision.
  - Source: [Agent Context Engineering 2026 — AgentMarketCap](https://agentmarketcap.ai/blog/2026/04/11/agent-context-engineering-sliding-windows-memory-2026)
- **ACON (Agent Context Optimization Networks):** agents learn from their own context-induced failures to refine information retention and compression over time — "failure-driven guideline optimization." Applied to long-running tasks where the agent must maintain task coherence over 50+ steps.
  - Source: [Agent Context Engineering 2026 — AgentMarketCap](https://agentmarketcap.ai/blog/2026/04/11/agent-context-engineering-sliding-windows-memory-2026)
- **Triggering heuristic:** summarize/compress when hitting 70–80% of context capacity. For Claude Sonnet 4.6 with a 200K token window, this is ~160K tokens — typically reached in Mangler conversations with many tool calls and large ticket/note payloads.
  - Source: [Context Window Management Strategies — apxml.com](https://apxml.com/courses/langchain-production-llm/chapter-3-advanced-memory-management/context-window-management)
- **65% of enterprise AI agent failures** stem from context drift, not model capability (PATTERN — from aggregated reports, not a single primary study).
  - Source: [Context Window Overflow — Redis](https://redis.io/blog/context-window-overflow/)

**Conflict note:** MA-001 in the ledger proposes LLM-based summarization; the Morph Compact approach is architecturally different (no LLM call needed, verbatim accuracy) but requires the Morph API, adding an external dependency. A local alternative (sliding window: drop middle messages, keep system + first K + last N) achieves partial compression with zero dependencies and is the safer starting point.

---

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

#### [MA-004] Layered System Prompt Caching (Split into Multiple Cache Breakpoints)
- **Date:** 2026-06-13
- **Status:** Proposed
- **Enabling advancement:** Anthropic prompt caching — up to 4 cache breakpoints per request; MA-002 confirmed the mechanism works in this codebase
- **Gap addressed:** MA-002 (Done) merged the entire system string (base prompt + definitions + agents) into a single cache block. If any part changes (e.g., a definition is edited, a new agent is added), the entire block is invalidated. The three parts have different volatility: base system prompt is session-invariant; definitions change when the user edits them; agents prompt changes when the user adds/removes agents. One shared block means the cheapest change (adding an agent) forces a full re-cache of the most expensive part (all definitions text).
- **User benefit:** Only the changed segment is re-cached when the user edits a definition or adds an agent. The stable base prompt continues to serve cache reads throughout the session.
- **Approach:** In `mangler.ts`, restructure the `system` array from one block to three (or two when definitions/agents are empty): Block 1 = `manglerSystemPrompt()` with `cache_control`; Block 2 = `manglerDefinitionsPrompt()` with `cache_control` (omitted if empty); Block 3 = `manglerAgentsPrompt()` without `cache_control` (agents list is shorter, changes more often, and caching it adds marginal value). Memory injection remains appended to block 3's text since it changes every turn and must never be cached.
- **Affected files:** `src/server/agents/mangler.ts`
- **Complexity:** Very Low (restructure existing array construction; no new dependencies)
- **Risk:** Anthropic enforces a maximum of 4 cache breakpoints per request. Current structure uses 1; proposed uses 2. Well within the limit.

---

#### [MA-005] Sliding-Window Context Compression for Long Mangler Sessions
- **Date:** 2026-06-13
- **Status:** Proposed
- **Enabling advancement:** Context window management research (2026): sliding windows + hierarchical summarization reduce context by 50–70% while preserving task coherence; Morph Compact achieves 98% verbatim accuracy; triggering at 70–80% capacity is the consensus heuristic
- **Gap addressed:** MA-001 (Proposed) proposes LLM-based summarization at the `MAX_TURNS` boundary. A complementary and lower-risk approach is a sliding window: when message history grows past a configurable byte threshold (proxy for token count), silently drop the oldest user+assistant pairs that are not tool-call-related, keeping the system prompt and the N most-recent exchanges. This avoids the LLM call and tool-result ID pairing risks of summarization.
- **User benefit:** Mangler sessions no longer stall at `MAX_TURNS = 12`. The conversation can run indefinitely without an LLM summarization call; only the oldest non-critical exchanges are dropped. Users working through a complex project across many turns no longer hit a hard wall.
- **Approach:** Before each turn in the `for (let turn = 0; turn < MAX_TURNS; turn++)` loop, estimate message byte length. If total exceeds `COMPRESS_THRESHOLD` (e.g., 200 KB, ~50K tokens), remove pairs from the front of the `messages` array that are plain text exchanges (no `tool_use` or `tool_result` blocks). Tool-call pairs must be kept contiguous or removed together (Anthropic requires `tool_result` to follow its `tool_use`). Broadcast a `mangler.delta` explaining that older context was trimmed. Remove the `MAX_TURNS` guard or raise it substantially once compression is in place.
- **Affected files:** `src/server/agents/mangler.ts`
- **Complexity:** Medium (message structure inspection to identify safe-to-drop pairs; byte estimation heuristic; must preserve tool-call pair integrity)
- **Risk:** Dropped context may cause Mangler to forget earlier decisions in the session. Users should be notified when compression fires. Cannot recover dropped context without a separate memory/storage step (see MA-001).

---

### Component: Orchestrated Agent Runs

---

#### [OR-001] Per-Run Token and Cost Tracking
- **Date:** 2026-06-07
- **Status:** Planned (Run 2, 2026-06-13 — see Section 6)
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

#### [OR-005] 1-Hour Prompt Cache TTL for Orchestrated and Agent Runs
- **Date:** 2026-06-13
- **Status:** Proposed
- **Enabling advancement:** `ENABLE_PROMPT_CACHING_1H` env variable in the Claude Agent SDK (verified, 2026-06-13)
- **Gap addressed:** The Agent SDK defaults to a 5-minute prompt cache TTL when using an API key. Typical orchestrated runs take 5–20 minutes; a cache miss partway through a run triggers a full re-cache write, erasing the cost benefit of the original write. The 1-hour TTL eliminates this mid-run expiry for all runs shorter than an hour.
- **User benefit:** Reduced cost on cache writes for any orchestrated or agent run exceeding 5 minutes. No behavioral change. Zero risk.
- **Approach:** In `src/server/agents/orchestrator.ts` and `src/server/agents/agentRun.ts`, pass `env: { ...process.env, ENABLE_PROMPT_CACHING_1H: "1" }` inside the `options` object of each `query()` call. One line per file.
- **Affected files:** `src/server/agents/orchestrator.ts`, `src/server/agents/agentRun.ts`
- **Complexity:** Very Low (1 line per file; no schema change, no UI change)
- **Risk:** 1-hour write cost is higher than 5-minute write cost; on very short runs (< 1 minute), this may cost slightly more. For typical runs > 5 minutes, break-even is immediate. Subscription (Pro/Max) users already get 1-hour TTL automatically and are unaffected.

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

#### [RT-002] Per-Client Run Event Subscription Filter
- **Date:** 2026-06-13
- **Status:** Proposed
- **Enabling advancement:** Standard WebSocket subscription/filter pattern; confirmed by WebSocket.org reconnection guide (2026)
- **Gap addressed:** `hub.ts:broadcast()` sends every `run.event` message to every connected WebSocket client. A client viewing the Projects page receives streaming run events for runs it has never opened. As runs grow in event volume (tool calls, large text blocks), this creates unnecessary bandwidth and client-side filtering work.
- **User benefit:** Each client only receives events for runs it has explicitly subscribed to. Clients on the Projects or Schedules pages receive zero run-event noise. Scales cleanly as the number of simultaneous runs grows.
- **Approach:** Add a `subscriptions: Set<string>` (set of run IDs) to each connected WS client entry in the hub. On connection, client sends `{type: "subscribe_run", runId}` and `{type: "unsubscribe_run", runId}`. In `broadcast()`, for `run.event` messages, only send to clients whose subscription set includes the `runId`. Broadcast all other message types unchanged (board updates, mangler events, etc. are low-volume and globally relevant).
- **Affected files:** `src/server/realtime/hub.ts`, `src/shared/ws.ts`, `src/client/lib/ws.ts`, `src/client/components/OrchestratedRunView.tsx`
- **Complexity:** Low (modify hub client tracking from `Set<WebSocket>` to `Map<WebSocket, Set<string>>`; add subscription messages to the WS contract)
- **Risk:** Clients that forget to subscribe will silently miss run events. Must ensure `OrchestratedRunView` subscribes on mount and unsubscribes on unmount.

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

#### [SC-004] Schedule-to-Run Traceability
- **Date:** 2026-06-13
- **Status:** Proposed
- **Enabling advancement:** Agentic workflow best practices — traceability between trigger and run is a named requirement in enterprise agent deployments (Virtido, 2026)
- **Gap addressed:** When a schedule fires and creates an agent run (via `fireAgentSchedule`), the run has no reference back to the schedule that created it. A user viewing the Runs page cannot tell which schedule triggered a given run, and the Schedules page cannot show "last 5 runs fired by this schedule."
- **User benefit:** Every schedule-triggered run is linkable to its source schedule. The Schedules page can show recent run history inline. Debugging a misbehaving schedule no longer requires correlating timestamps manually.
- **Approach:** Add `triggered_by_schedule_id TEXT REFERENCES schedules(id) ON DELETE SET NULL` to the `agent_runs` table. Pass the schedule ID into `runsRepo.create()` when called from `fireAgentSchedule`. Add a `listBySchedule(scheduleId: string)` query to `runsRepo`. Render the last 3 triggered runs in the schedule card on `SchedulesPage.tsx`.
- **Affected files:** `src/server/db/schema.ts`, `src/server/db/runs.ts`, `src/server/scheduler.ts`, `src/shared/types.ts`, `src/client/pages/SchedulesPage.tsx`
- **Complexity:** Low (schema migration + FK wiring + UI list)
- **Risk:** Schema migration must handle existing runs gracefully (NULL for old rows, which is the default via `ON DELETE SET NULL`).

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

## Run 2 — 2026-06-13

## 4b. Improvement Selection (Run 2)

### Selected: [OR-001] — Per-Run Token and Cost Tracking

**Exclusions (all remaining Proposed ideas):**

| Idea | Reason excluded this run |
|------|--------------------------|
| MA-001 (Summarization) | Higher complexity; depends on context structure constraints; better after MA-005 sliding window is implemented |
| MA-003 (Adaptive Thinking) | Behavioral risk; low urgency relative to cost visibility |
| MA-004 (Layered Caching) | Very low complexity but purely incremental on MA-002; cost benefit is marginal per turn |
| MA-005 (Sliding-Window Compression) | Medium complexity; the MAX_TURNS guard is a real UX issue but secondary to cost visibility |
| OR-002 (Run Resume) | Session resume API is now fully documented; medium complexity due to UI work needed |
| OR-003 (Granular Tool Approval) | Good UX feature; lower urgency than cost visibility |
| OR-005 (1-Hour Cache TTL) | Very Low complexity, high ratio, but trivially combined with OR-001 (same files, same deploy) |
| RT-001 (Event Replay) | Medium complexity; the agent_events table already provides data; plan is sound but implementation risk is higher |
| RT-002 (Subscription Filter) | Low complexity but a scalability optimization, not a user-facing feature |
| SC-001–SC-004 (Scheduling) | Schedule improvements are secondary to run visibility |
| ME-001, ME-002 (Memory) | High complexity or Honcho-dependent |
| DF-001 (Version History) | Medium complexity; correct but not urgent |

**Justification:**

The June 15, 2026 billing change makes cost tracking no longer optional. Agent SDK usage now bills at API rates from a separate monthly credit pool. A user whose orchestrated runs each cost $0.04–$0.12 will exhaust $20 of monthly credit in 200–500 runs — a realistic number for an active user delegating tasks daily. There is currently **zero cost signal** anywhere in the product.

The SDK provides the exact data needed via a single field on the `result` message (`message.total_cost_usd`). The current `handleMessage()` function in `runEngine.ts` processes `result` messages and ignores this field. Adding cost capture requires:
1. One new nullable `REAL` column on `agent_runs`
2. Three lines in `runEngine.ts` to read and persist the field
3. One repo method `setCost()`
4. A cost badge in `RunListDetail.tsx` and `RunBody.tsx`

No new dependencies. No API surface changes. No behavioral risk. The plan is exactly specified by verified SDK documentation.

OR-005 (1-Hour Cache TTL) will be bundled into this plan's implementation since it affects the same orchestrator and agent run files and can be deployed as a single change.

---

## 6. Implementation Plan: [OR-001] Per-Run Cost Capture + [OR-005] 1-Hour Cache TTL Bundle

**Objective:** Store and display the estimated USD cost of every orchestrated and agent SDK run; simultaneously extend prompt cache TTL to 1 hour for all non-subscription API users.

### 6.1 How the SDK Exposes Cost

From the verified SDK docs (`code.claude.com/docs/en/agent-sdk/cost-tracking`):

```typescript
// When msg.type === "result":
msg.total_cost_usd   // number | undefined — cumulative estimated cost for this query() call
msg.modelUsage       // { [modelName]: { costUSD, inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens } }
```

The result message is already handled in `runEngine.ts:handleMessage()` at line 82–88. It calls `runsRepo.setSummary()` and `runsRepo.setStatus()` but ignores `total_cost_usd`.

### 6.2 Affected Files

| File | Change |
|------|--------|
| `src/server/db/schema.ts` | Add `cost_usd REAL` column to `agent_runs` |
| `src/shared/types.ts` | Add `costUsd: number \| null` field to `AgentRun` Zod schema |
| `src/server/db/runs.ts` | Add `cost_usd` to `RunRow`, `toRun()`, `create()`, and new `setCost(id, cost)` method |
| `src/server/agents/runEngine.ts` | In `handleMessage()`, read `msg.total_cost_usd` on `result` and call `runsRepo.setCost()` |
| `src/server/agents/orchestrator.ts` | Pass `env: { ...process.env, ENABLE_PROMPT_CACHING_1H: "1" }` in `query()` options (OR-005) |
| `src/server/agents/agentRun.ts` | Same OR-005 env option in its `query()` call |
| `src/client/components/RunListDetail.tsx` | Display `costUsd` as a `$0.0123` badge in the run list item and detail header |
| `src/client/components/RunBody.tsx` | (Optional) Show cost in the run metadata bar if the component renders run metadata |

### 6.3 Implementation Approach

**Schema migration** — append to `schema.ts` SCHEMA string:

```sql
ALTER TABLE agent_runs ADD COLUMN cost_usd REAL;
```

(SQLite `ALTER TABLE … ADD COLUMN` is safe for additive changes; existing rows get `NULL`.)

**Type update** — in `shared/types.ts`, add to `AgentRun`:

```typescript
costUsd: z.number().nullable(),
```

**Repo update** — in `runs.ts`:

```typescript
// RunRow interface: add
cost_usd: number | null;

// toRun(): add
costUsd: r.cost_usd,

// create(): add to INSERT and the run object
costUsd: null,

// new method:
setCost(id: string, cost: number): void {
  db().prepare("UPDATE agent_runs SET cost_usd = ? WHERE id = ?").run(cost, id);
},
```

**runEngine.ts** — in `handleMessage()`, in the `result` branch:

```typescript
if (msg.type === "result") {
  // existing lines:
  const summary = msg.subtype === "success" ? msg.result : `ended: ${msg.subtype}`;
  emit(run.id, "result", { subtype: msg.subtype, text: summary });
  runsRepo.setSummary(runId, String(summary).slice(0, 800));
  runsRepo.setStatus(runId, msg.subtype === "success" ? "done" : "failed");
  // new line:
  if (msg.total_cost_usd != null) runsRepo.setCost(runId, msg.total_cost_usd);
  return true;
}
```

**orchestrator.ts / agentRun.ts** — OR-005 bundle, pass env in options:

```typescript
const q = query({
  prompt,
  options: {
    cwd: run.cwd,
    model: run.model ?? DEFAULT_ORCH_MODEL,
    permissionMode: "plan",
    canUseTool,
    maxTurns: MAX_TURNS,
    env: { ...process.env, ENABLE_PROMPT_CACHING_1H: "1" },
  },
});
```

**UI — RunListDetail.tsx** — in the run list item, after the status Mono:

```tsx
{run.costUsd != null && (
  <Mono title="Estimated run cost">~${run.costUsd.toFixed(4)}</Mono>
)}
```

In the detail header section (where `selected.status` is shown), add the same badge inline.

### 6.4 Dependencies

- `@anthropic-ai/claude-agent-sdk` — already installed; `result.total_cost_usd` is documented as of the current version
- No new npm packages
- SQLite `ALTER TABLE` migration — additive, no data loss

### 6.5 Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `total_cost_usd` is `undefined` on some result subtypes | Low | Guard with `!= null` check before calling `setCost` |
| SDK version in use predates `total_cost_usd` on result message | Very Low | Verify field exists in `SDKResultMessage` type; null-guard means zero production impact if absent |
| Users mistake estimate for authoritative billing | Low | Label as "~$" (tilde prefix) in the UI and add a tooltip: "Estimated cost. See Claude Console for authoritative billing." |
| `ENABLE_PROMPT_CACHING_1H` breaks runs on subscription plans | None | Docs state subscription users already receive 1-hour TTL; this env var is a no-op for them |
| SQLite migration fails | Very Low | `ADD COLUMN` is unconditional; SCHEMA string is applied idempotently via `CREATE TABLE IF NOT EXISTS` pattern; ADD COLUMN needs a migration guard |

**Migration guard:** The `SCHEMA` in `schema.ts` is used by `db/index.ts` to initialize the schema. Since it uses `CREATE TABLE IF NOT EXISTS`, new tables are safe, but `ALTER TABLE … ADD COLUMN` will fail if the column already exists on a re-run. Inspect how `db/index.ts` applies the schema to determine whether the ALTER needs a conditional guard (e.g., check `pragma table_info(agent_runs)` first).

### 6.6 Validation Strategy

1. **Type check:** `npm run typecheck` — `costUsd` must appear on `AgentRun` and `RunRow` with no type errors
2. **Unit test:** In `src/server/db/runs.test.ts` (or similar), add a test that creates a run, calls `setCost(id, 0.0123)`, and asserts `runsRepo.get(id)?.costUsd === 0.0123`
3. **Integration test (manual):** Start dev server; delegate a ticket to an orchestrated agent run; wait for completion; inspect the run in the UI — verify the `~$0.XXXX` badge appears in the list item and detail header
4. **Regression test:** `npm test` — all existing run-related tests must pass unchanged
5. **Build verification:** `npm run build` — confirms the schema migration change doesn't break tsup compilation

### 6.7 Success Criteria

- `cost_usd` column exists in `agent_runs` after server start
- Completed orchestrated and agent runs display a cost estimate in the UI
- PTY runs show no cost badge (cost is undefined/null — they don't use the Agent SDK)
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass
- No observable behavioral change in run execution

---

*End of Run 2 — 2026-06-13*
