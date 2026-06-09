import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post } from "../lib/api";
import { useWsMessage } from "../lib/ws";
import type { ChatMessage, Conversation } from "../../shared/types";
import { Button, Mono, StatusDot, Textarea } from "../components/ui";
import { MarkdownMessage } from "../components/MarkdownMessage";
import { usePageTitle } from "../components/PageTitleProvider";

interface ToolEvent {
  tool: string;
  done: boolean;
  summary?: string;
}

interface PendingCommand {
  commandId: string;
  command: string;
  cwd: string;
}

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
}

function blocksOf(content: unknown): ContentBlock[] {
  return Array.isArray(content) ? (content as ContentBlock[]) : [];
}

const NEW_CHAT = "__new__";

function lastOpenToolIndex(events: ToolEvent[], tool: string): number {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].tool === tool && !events[i].done) return i;
  }
  return -1;
}

export function ManglerPage() {
  usePageTitle("Mangler");
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [pendingCommands, setPendingCommands] = useState<PendingCommand[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: conversations = [] } = useQuery({ queryKey: ["conversations"], queryFn: () => get<Conversation[]>("/conversations") });
  const activeId = selectedId === NEW_CHAT ? null : selectedId ?? conversations[0]?.id ?? null;
  const activeIdRef = useRef<string | null>(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", activeId],
    queryFn: () => get<ChatMessage[]>(`/conversations/${activeId}/messages`),
    enabled: Boolean(activeId),
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, toolEvents]);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const scroller = rootRef.current?.closest("main");
    if (!scroller) return;
    scrollerRef.current = scroller;
    const onScroll = () => setShowTop(scroller.scrollTop > 300);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  useWsMessage((msg) => {
    if (!("conversationId" in msg) || msg.conversationId !== activeIdRef.current) return;
    if (msg.type === "mangler.delta") setStreamingText((s) => s + msg.text);
    else if (msg.type === "mangler.tool") {
      setToolEvents((prev) => {
        if (msg.phase === "start") return [...prev, { tool: msg.tool, done: false }];
        const i = lastOpenToolIndex(prev, msg.tool);
        if (i === -1) return prev;
        const next = [...prev];
        next[i] = { tool: msg.tool, done: true, summary: msg.summary };
        return next;
      });
    } else if (msg.type === "mangler.command") {
      setPendingCommands((prev) => [...prev, { commandId: msg.commandId, command: msg.command, cwd: msg.cwd }]);
    } else if (msg.type === "mangler.command_resolved") {
      setPendingCommands((prev) => prev.filter((c) => c.commandId !== msg.commandId));
    } else if (msg.type === "mangler.done") {
      setRunning(false);
      setStreamingText("");
      setToolEvents([]);
      setPendingCommands([]);
      void qc.invalidateQueries({ queryKey: ["messages", activeIdRef.current] });
    } else if (msg.type === "mangler.error") {
      setRunning(false);
      setError(msg.error);
    }
  });

  const stop = useMutation({ mutationFn: () => post(`/conversations/${activeIdRef.current}/stop`) });

  const decideCommand = useMutation({
    mutationFn: (vars: { commandId: string; approved: boolean }) => post(`/commands/${vars.commandId}/decide`, { approved: vars.approved }),
  });

  function decide(commandId: string, approved: boolean) {
    setPendingCommands((prev) => prev.filter((c) => c.commandId !== commandId));
    decideCommand.mutate({ commandId, approved });
  }

  const removeConversation = useMutation({
    mutationFn: (id: string) => del(`/conversations/${id}`),
    onSuccess: () => {
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  async function send() {
    const text = input.trim();
    if (!text || running) return;
    setInput("");
    setError(null);

    let cid = activeId;
    if (!cid) {
      const conv = await post<Conversation>("/conversations");
      cid = conv.id;
      setSelectedId(cid);
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    }
    activeIdRef.current = cid;
    setRunning(true);
    setStreamingText("");
    setToolEvents([]);
    setPendingCommands([]);
    await post(`/conversations/${cid}/messages`, { text });
    void qc.invalidateQueries({ queryKey: ["messages", cid] });
    void qc.invalidateQueries({ queryKey: ["conversations"] });
  }

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <header className="mb-6 flex items-end justify-between gap-6 border-b border-hairline pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Mono>primary agent</Mono>
            <StatusDot tone={running ? "accent" : "good"} pulse={running} />
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Mangler</h1>
        </div>
        <div className="flex items-center gap-2">
          {conversations.length > 0 && (
            <select
              value={activeId ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
              className="max-w-56 rounded-md border border-hairline-strong bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
            >
              {activeId === null && (
                <option value="" disabled>
                  New chat…
                </option>
              )}
              {conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          )}
          {activeId && (
            <button onClick={() => removeConversation.mutate(activeId)} title="Delete conversation">
              <Mono className="hover:text-bad">del</Mono>
            </button>
          )}
          <Button onClick={() => setSelectedId(NEW_CHAT)}>+ New chat</Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4">
        {messages.length === 0 && !running && (
          <div className="py-16 text-center">
            <p className="text-sm text-muted">Ask Mangler to organize your work.</p>
            <p className="mt-1 text-sm text-faint">
              "What's on my board?" · "Create a ticket in api-gateway to add rate limiting" · "Note: revisit the auth design"
            </p>
          </div>
        )}

        {messages.map((m) => (
          <MessageView key={m.id} message={m} />
        ))}

        {running && (streamingText || toolEvents.length > 0) && (
          <div className="max-w-2xl">
            <Mono>mangler</Mono>
            {toolEvents.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {toolEvents.map((t, i) => (
                  <ToolChip key={i} event={t} />
                ))}
              </div>
            )}
            {streamingText && <MarkdownMessage className="mt-2" text={streamingText} />}
          </div>
        )}
        {pendingCommands.length > 0 && (
          <div className="space-y-3">
            {pendingCommands.map((c) => (
              <CommandApproval key={c.commandId} command={c} onDecide={decide} />
            ))}
          </div>
        )}
        {running && !streamingText && toolEvents.length === 0 && pendingCommands.length === 0 && (
          <p className="text-sm text-faint">Mangler is thinking…</p>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}

        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 -mx-10 mt-4 border-t border-hairline bg-paper/95 px-10 pb-3 pt-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="Message Mangler…  (Enter to send, Shift+Enter for newline)"
          />
          {running ? (
            <Button variant="solid" onClick={() => stop.mutate()}>
              Stop
            </Button>
          ) : (
            <Button variant="solid" onClick={() => void send()} disabled={!input.trim()}>
              Send
            </Button>
          )}
        </div>
      </div>

      {showTop && (
        <button
          type="button"
          onClick={() => scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
          title="Back to top"
          className="fixed bottom-24 right-8 z-30 inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink shadow-lg transition-colors hover:bg-paper"
        >
          ↑ Top
        </button>
      )}
    </div>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    if (typeof message.content !== "string") return null; // tool_result carrier — not shown
    return (
      <div className="flex justify-end">
        <div className="max-w-2xl rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-paper">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  const blocks = blocksOf(message.content);
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
  const tools = blocks.filter((b) => b.type === "tool_use");

  if (!text && tools.length === 0) return null;

  return (
    <div className="max-w-2xl">
      <Mono>mangler</Mono>
      {tools.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tools.map((b, i) => (
            <ToolChip key={i} event={{ tool: b.name ?? "tool", done: true }} />
          ))}
        </div>
      )}
      {text && <MarkdownMessage className="mt-2" text={text} />}
    </div>
  );
}

function CommandApproval({ command, onDecide }: { command: PendingCommand; onDecide: (commandId: string, approved: boolean) => void }) {
  return (
    <div className="max-w-2xl rounded-lg border border-warn/40 bg-warn/5">
      <div className="flex items-center gap-2 px-4 pt-3">
        <StatusDot tone="warn" pulse />
        <Mono>run command</Mono>
        <span className="text-[12px] text-faint">{command.cwd}</span>
      </div>
      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap px-4 py-3 font-mono text-[12px] leading-relaxed text-ink">{command.command}</pre>
      <div className="flex gap-2 border-t border-hairline px-4 py-3">
        <Button variant="solid" onClick={() => onDecide(command.commandId, true)}>
          Approve &amp; run
        </Button>
        <Button onClick={() => onDecide(command.commandId, false)}>Deny</Button>
      </div>
    </div>
  );
}

function ToolChip({ event }: { event: ToolEvent }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-surface px-2.5 py-1 font-mono text-[11px] text-muted">
      <StatusDot tone={event.done ? "good" : "accent"} pulse={!event.done} />
      {event.tool}
      {event.summary && <span className="text-faint">· {event.summary}</span>}
    </span>
  );
}
