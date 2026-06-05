import { env } from "../env";
import { workspaceBaseUrl } from "./databricks";

// The Genie Conversation API (https://docs.databricks.com/aws/en/genie/conversation-api) is
// poll-based: start (or continue) a conversation, then poll the message until a terminal status,
// then read its attachments. It uses the same workspace host + token as Model Serving, under the
// /api/2.0/genie path rather than /serving-endpoints.

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 120_000;
const TABLE_ROW_CAP = 20;

interface GenieAttachment {
  attachment_id?: string;
  text?: { content?: string };
  query?: { query?: string; description?: string };
}

interface GenieMessage {
  status?: string;
  attachments?: GenieAttachment[];
}

// query-result mirrors the SQL Statement Execution API response.
interface GenieQueryResult {
  statement_response?: {
    manifest?: { schema?: { columns?: { name?: string }[] }; total_row_count?: number };
    result?: { data_array?: string[][] };
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function requireCreds(): { host: string; token: string } {
  if (!env.databricksHost || !env.databricksToken) throw new Error("Databricks not configured (set DATABRICKS_HOST and DATABRICKS_TOKEN).");
  return { host: env.databricksHost, token: env.databricksToken };
}

async function genieFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Genie API ${res.status}: ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

// Ask a Genie space a question, continuing an existing conversation when genieConversationId is set.
// Returns the formatted reply and the Genie conversation id (so the caller can persist it for memory).
export async function askGenie(args: {
  spaceId: string;
  content: string;
  genieConversationId?: string;
}): Promise<{ reply: string; conversationId: string }> {
  const { host, token } = requireCreds();
  const base = `${workspaceBaseUrl(host)}/api/2.0/genie/spaces/${args.spaceId}`;

  let conversationId: string;
  let messageId: string;
  if (args.genieConversationId) {
    conversationId = args.genieConversationId;
    const created = await genieFetch<{ message?: { id?: string }; id?: string }>(
      `${base}/conversations/${conversationId}/messages`,
      token,
      { method: "POST", body: JSON.stringify({ content: args.content }) },
    );
    messageId = created.message?.id ?? created.id ?? "";
  } else {
    const started = await genieFetch<{ conversation?: { id?: string }; conversation_id?: string; message?: { id?: string } }>(
      `${base}/start-conversation`,
      token,
      { method: "POST", body: JSON.stringify({ content: args.content }) },
    );
    conversationId = started.conversation?.id ?? started.conversation_id ?? "";
    messageId = started.message?.id ?? "";
  }
  if (!conversationId || !messageId) throw new Error("Genie did not return a conversation or message id.");

  const message = await pollMessage(base, token, conversationId, messageId);

  const tables: Record<string, string> = {};
  for (const a of message.attachments ?? []) {
    if (a.query?.query && a.attachment_id) {
      const result = await genieFetch<GenieQueryResult>(
        `${base}/conversations/${conversationId}/messages/${messageId}/query-result/${a.attachment_id}`,
        token,
      );
      tables[a.attachment_id] = formatResultTable(result, TABLE_ROW_CAP);
    }
  }

  return { reply: buildReply(message.attachments ?? [], tables), conversationId };
}

async function pollMessage(base: string, token: string, conversationId: string, messageId: string): Promise<GenieMessage> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  const url = `${base}/conversations/${conversationId}/messages/${messageId}`;
  for (;;) {
    const message = await genieFetch<GenieMessage>(url, token);
    const status = message.status ?? "";
    if (status === "COMPLETED") return message;
    if (status === "FAILED" || status === "CANCELLED") throw new Error(`Genie message ${status.toLowerCase()}.`);
    if (Date.now() > deadline) throw new Error("Genie message timed out.");
    await sleep(POLL_INTERVAL_MS);
  }
}

// Stitch a Genie message's attachments into a single reply: natural-language text, plus any
// generated SQL (with its description) and the pre-fetched result table for that query.
export function buildReply(attachments: GenieAttachment[], tables: Record<string, string>): string {
  const parts: string[] = [];
  for (const a of attachments) {
    if (a.text?.content) parts.push(a.text.content);
    if (a.query?.query) {
      if (a.query.description) parts.push(a.query.description);
      parts.push(`\`\`\`sql\n${a.query.query}\n\`\`\``);
      const table = a.attachment_id ? tables[a.attachment_id] : undefined;
      if (table) parts.push(table);
    }
  }
  return parts.join("\n\n").trim() || "(Genie returned no content.)";
}

// Render a Genie query result as a Markdown table, capped at `cap` rows.
export function formatResultTable(result: GenieQueryResult, cap = TABLE_ROW_CAP): string {
  const sr = result.statement_response;
  const columns = (sr?.manifest?.schema?.columns ?? []).map((c) => c.name ?? "");
  const rows = sr?.result?.data_array ?? [];
  if (columns.length === 0) return "";
  if (rows.length === 0) return "_(no rows)_";

  const shown = rows.slice(0, cap);
  const header = `| ${columns.join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = shown.map((r) => `| ${columns.map((_, i) => String(r[i] ?? "")).join(" | ")} |`).join("\n");
  const total = sr?.manifest?.total_row_count ?? rows.length;
  const footer = total > shown.length ? `\n\n_… showing ${shown.length} of ${total} rows_` : "";
  return `${header}\n${divider}\n${body}${footer}`;
}
