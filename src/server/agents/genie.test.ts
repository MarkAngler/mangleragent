import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Isolate the data dir and supply Databricks creds before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-genie-test-"));
process.env.MANGLED_DATA_DIR = tmp;
process.env.DATABRICKS_HOST = "example.cloud.databricks.com";
process.env.DATABRICKS_TOKEN = "tok";

const { askGenie, buildReply, formatResultTable } = await import("./genie");

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

// Route a mocked fetch by (method, url) so each Genie step returns its own canned response.
function mockFetch(routes: (call: FetchCall) => unknown): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call: FetchCall = {
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return jsonResponse(routes(call));
  }) as unknown as typeof fetch;
  return { calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

const BASE = "https://example.cloud.databricks.com/api/2.0/genie/spaces/space1";

const QUERY_RESULT = {
  statement_response: {
    manifest: { schema: { columns: [{ name: "region" }, { name: "total" }] }, total_row_count: 2 },
    result: { data_array: [["us", "100"], ["eu", "200"]] },
  },
};

describe("askGenie", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("starts a conversation and builds a reply with text, SQL, and a result table", async () => {
    const completedMessage = {
      status: "COMPLETED",
      attachments: [
        { text: { content: "Here are the sales by region." } },
        { attachment_id: "att1", query: { query: "SELECT region, total FROM sales", description: "Sales by region" } },
      ],
    };
    const { calls } = mockFetch((call) => {
      if (call.url.endsWith("/start-conversation")) return { conversation: { id: "conv1" }, message: { id: "msg1" } };
      if (call.url.endsWith("/query-result/att1")) return QUERY_RESULT;
      return completedMessage; // GET poll
    });

    const result = await askGenie({ spaceId: "space1", content: "sales by region?" });

    expect(result.conversationId).toBe("conv1");
    expect(result.reply).toContain("Here are the sales by region.");
    expect(result.reply).toContain("```sql\nSELECT region, total FROM sales\n```");
    expect(result.reply).toContain("Sales by region");
    expect(result.reply).toContain("| region | total |");
    expect(result.reply).toContain("| us | 100 |");

    const start = calls[0];
    expect(start.url).toBe(`${BASE}/start-conversation`);
    expect(start.method).toBe("POST");
    expect(start.body).toEqual({ content: "sales by region?" });
  });

  it("continues an existing conversation via the messages endpoint when genieConversationId is set", async () => {
    const { calls } = mockFetch((call) => {
      if (call.method === "POST") return { message: { id: "msg2" } };
      return { status: "COMPLETED", attachments: [{ text: { content: "Follow-up answer." } }] };
    });

    const result = await askGenie({ spaceId: "space1", content: "and last month?", genieConversationId: "conv1" });

    expect(result.conversationId).toBe("conv1");
    expect(result.reply).toBe("Follow-up answer.");
    const post = calls[0];
    expect(post.url).toBe(`${BASE}/conversations/conv1/messages`);
    expect(post.method).toBe("POST");
    expect(calls.some((c) => c.url.endsWith("/start-conversation"))).toBe(false);
  });

  it("throws when the message ends in FAILED", async () => {
    mockFetch((call) => {
      if (call.url.endsWith("/start-conversation")) return { conversation: { id: "conv1" }, message: { id: "msg1" } };
      return { status: "FAILED" };
    });
    await expect(askGenie({ spaceId: "space1", content: "boom" })).rejects.toThrow(/failed/i);
  });
});

describe("formatResultTable", () => {
  it("renders a Markdown table and caps rows with a truncation note", () => {
    const rows = Array.from({ length: 25 }, (_, i) => [`r${i}`, String(i)]);
    const table = formatResultTable(
      { statement_response: { manifest: { schema: { columns: [{ name: "id" }, { name: "n" }] }, total_row_count: 25 }, result: { data_array: rows } } },
      20,
    );
    expect(table).toContain("| id | n |");
    expect(table).toContain("| r0 | 0 |");
    expect(table).toContain("| r19 | 19 |");
    expect(table).not.toContain("| r20 | 20 |");
    expect(table).toContain("_… showing 20 of 25 rows_");
  });

  it("returns a no-rows marker when the result is empty and nothing when there are no columns", () => {
    expect(formatResultTable({ statement_response: { manifest: { schema: { columns: [{ name: "id" }] } }, result: { data_array: [] } } })).toBe("_(no rows)_");
    expect(formatResultTable({})).toBe("");
  });
});

describe("buildReply", () => {
  it("joins text and SQL attachments, falling back when empty", () => {
    expect(buildReply([{ text: { content: "Answer." } }], {})).toBe("Answer.");
    expect(buildReply([], {})).toBe("(Genie returned no content.)");
  });
});
