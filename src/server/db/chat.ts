import { randomUUID } from "node:crypto";
import { db, now } from "./index";
import type { ChatMessage, Conversation } from "../../shared/types";

interface ConversationRow {
  id: string;
  title: string;
  created_at: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content_json: string;
  created_at: number;
}

export const conversationsRepo = {
  list(): Conversation[] {
    return (db().prepare("SELECT * FROM conversations ORDER BY created_at DESC").all() as ConversationRow[]).map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
    }));
  },

  get(id: string): Conversation | undefined {
    const r = db().prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConversationRow | undefined;
    return r ? { id: r.id, title: r.title, createdAt: r.created_at } : undefined;
  },

  create(title = "New conversation"): Conversation {
    const conv: Conversation = { id: randomUUID(), title, createdAt: now() };
    db().prepare("INSERT INTO conversations (id, title, created_at) VALUES (?, ?, ?)").run(conv.id, conv.title, conv.createdAt);
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
