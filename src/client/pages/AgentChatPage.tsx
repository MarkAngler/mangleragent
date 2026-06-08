import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post } from "../lib/api";
import { useWsMessage } from "../lib/ws";
import type { Agent, ChatMessage, Conversation } from "../../shared/types";
import { Button, Mono, StatusDot, Textarea } from "../components/ui";
import { usePageTitle } from "../components/PageTitleProvider";

const NEW_CHAT = "__new__";

export function AgentChatPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: agent } = useQuery({ queryKey: ["agent", id], queryFn: () => get<Agent>(`/agents/${id}`) });
  usePageTitle(agent?.name ?? "Agent");
  const { data: conversations = [] } = useQuery({
    queryKey: ["agent-chat-conversations", id],
    queryFn: () => get<Conversation[]>(`/agents/${id}/conversations`),
  });

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
  }, [messages, streamingText]);

  useWsMessage((msg) => {
    if (!("conversationId" in msg) || msg.conversationId !== activeIdRef.current) return;
    if (msg.type === "agent.delta") setStreamingText((s) => s + msg.text);
    else if (msg.type === "agent.done") {
      setRunning(false);
      setStreamingText("");
      void qc.invalidateQueries({ queryKey: ["messages", activeIdRef.current] });
    } else if (msg.type === "agent.error") {
      setRunning(false);
      setError(msg.error);
    }
  });

  const removeConversation = useMutation({
    mutationFn: (cid: string) => del(`/conversations/${cid}`),
    onSuccess: () => {
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ["agent-chat-conversations", id] });
    },
  });

  async function send() {
    const text = input.trim();
    if (!text || running) return;
    setInput("");
    setError(null);

    let cid = activeId;
    if (!cid) {
      const conv = await post<Conversation>(`/agents/${id}/conversations`);
      cid = conv.id;
      setSelectedId(cid);
      void qc.invalidateQueries({ queryKey: ["agent-chat-conversations", id] });
    }
    activeIdRef.current = cid;
    setRunning(true);
    setStreamingText("");
    await post(`/conversations/${cid}/messages`, { text });
    void qc.invalidateQueries({ queryKey: ["messages", cid] });
    void qc.invalidateQueries({ queryKey: ["agent-chat-conversations", id] });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="mb-6 flex items-end justify-between gap-6 border-b border-hairline pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/agents">
              <Mono className="hover:text-ink">agents</Mono>
            </Link>
            <StatusDot tone={running ? "accent" : "good"} pulse={running} />
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{agent?.name ?? "Agent"}</h1>
          {agent && (
            <Mono className="mt-1 block text-faint">
              {agent.type} · {agent.mcpServerIds.length} mcp
            </Mono>
          )}
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
            <p className="text-sm text-muted">Send a message to {agent?.name ?? "this agent"}.</p>
          </div>
        )}

        {messages.map((m) => (
          <MessageView key={m.id} message={m} />
        ))}

        {running && streamingText && (
          <div className="max-w-2xl">
            <Mono>{agent?.name ?? "agent"}</Mono>
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{streamingText}</p>
          </div>
        )}
        {running && !streamingText && <p className="text-sm text-faint">Thinking…</p>}
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
            placeholder={`Message ${agent?.name ?? "agent"}…  (Enter to send, Shift+Enter for newline)`}
          />
          <Button variant="solid" onClick={() => void send()} disabled={running || !input.trim()}>
            {running ? "…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  const text = typeof message.content === "string" ? message.content : "";
  if (!text) return null;

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-2xl rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-paper">
          <p className="whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Mono>agent</Mono>
      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{text}</p>
    </div>
  );
}
