import { randomUUID } from "node:crypto";
import { db, now } from "./index";
import type { ChatMessage, Conversation } from "../../shared/types";

interface ConversationRow {
  id: string;
  title: string;
  agent_id: string | null;
  created_at: number;
}

function toConversation(r: ConversationRow): Conversation {
  return { id: r.id, title: r.title, agentId: r.agent_id, createdAt: r.created_at };
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content_json: string;
  created_at: number;
}

export const conversationsRepo = {
  // Mangler's own conversations only; external-agent chats (agent_id set) are listed per agent.
  list(): Conversation[] {
    return (db().prepare("SELECT * FROM conversations WHERE agent_id IS NULL ORDER BY created_at DESC").all() as ConversationRow[]).map(
      toConversation,
    );
  },

  listByAgent(agentId: string): Conversation[] {
    return (db().prepare("SELECT * FROM conversations WHERE agent_id = ? ORDER BY created_at DESC").all(agentId) as ConversationRow[]).map(
      toConversation,
    );
  },

  get(id: string): Conversation | undefined {
    const r = db().prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConversationRow | undefined;
    return r ? toConversation(r) : undefined;
  },

  create(title = "New conversation", agentId: string | null = null): Conversation {
    const conv: Conversation = { id: randomUUID(), title, agentId, createdAt: now() };
    db()
      .prepare("INSERT INTO conversations (id, title, agent_id, created_at) VALUES (?, ?, ?, ?)")
      .run(conv.id, conv.title, conv.agentId, conv.createdAt);
    return conv;
  },

  rename(id: string, title: string): void {
    db().prepare("UPDATE conversations SET title = ? WHERE id = ?").run(title, id);
  },

  remove(id: string): boolean {
    return db().prepare("DELETE FROM conversations WHERE id = ?").run(id).changes > 0;
  },

  messageCount(id: string): number {
    return (db().prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?").get(id) as { n: number }).n;
  },

  // Genie issues its own conversation id; persist it so follow-up turns keep context.
  // Server-only — not part of the shared Conversation type sent to clients.
  getGenieConversationId(id: string): string | null {
    const row = db().prepare("SELECT genie_conversation_id FROM conversations WHERE id = ?").get(id) as
      | { genie_conversation_id: string | null }
      | undefined;
    return row?.genie_conversation_id ?? null;
  },

  setGenieConversationId(id: string, genieConversationId: string): void {
    db().prepare("UPDATE conversations SET genie_conversation_id = ? WHERE id = ?").run(genieConversationId, id);
  },
};

export const messagesRepo = {
  list(conversationId: string): ChatMessage[] {
    const rows = db()
      .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, id")
      .all(conversationId) as MessageRow[];
    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      role: r.role,
      content: JSON.parse(r.content_json) as unknown,
      createdAt: r.created_at,
    }));
  },

  add(conversationId: string, role: "user" | "assistant", content: unknown): ChatMessage {
    const message: ChatMessage = { id: randomUUID(), conversationId, role, content, createdAt: now() };
    db()
      .prepare("INSERT INTO messages (id, conversation_id, role, content_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(message.id, conversationId, role, JSON.stringify(content), message.createdAt);
    return message;
  },
};
