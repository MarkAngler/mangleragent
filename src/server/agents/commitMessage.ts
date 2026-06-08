import type { RunDiff } from "../../shared/types";
import { configRepo } from "../db/config";
import { getAnthropic } from "./anthropic";
import { completeDatabricks } from "./databricks";

const ANTHROPIC_COMMIT_MODEL = "claude-haiku-4-5-20251001";
const COMMIT_SYSTEM =
  "Write a git commit message in the Conventional Commits format `<type>[optional scope]: <description>` " +
  "(types: feat, fix, refactor, test, docs, chore, perf, ci, build) for the diff below. " +
  "Use a concise imperative subject of at most 72 characters, optionally followed by a blank line and a short body. " +
  "Reply with ONLY the commit message — no quotes, no code fences, no preamble.";

const MAX_DIFF_CHARS = 12000;

// Strip wrapping code fences / quotes a model may add despite the instruction.
export function cleanMessage(raw: string): string {
  return raw
    .trim()
    .replace(/^```[^\n]*\n?/, "")
    .replace(/\n?```$/, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

// Render the diff as a compact summary plus its (non-binary) patches, bounded so
// large diffs don't blow the token budget.
export function diffToPrompt(diff: RunDiff): string {
  const summary = diff.files.map((f) => `- ${f.path} (${f.status}, +${f.additions} -${f.deletions})`).join("\n");
  const patches = diff.files
    .filter((f) => !f.binary)
    .map((f) => f.patch)
    .join("\n");
  const body = `Files changed:\n${summary}\n\nDiff:\n${patches}`;
  return body.length > MAX_DIFF_CHARS ? body.slice(0, MAX_DIFF_CHARS) : body;
}

// Draft a commit message from the current changes, using whichever provider the
// user configured for Mangler chat. Returns "" when there is nothing to commit
// or the provider isn't configured — the caller falls back to manual entry.
export async function generateCommitMessage(diff: RunDiff): Promise<string> {
  if (!diff.available || diff.files.length === 0) return "";
  const user = diffToPrompt(diff);
  if ((configRepo.get("mangler_provider") ?? "anthropic") === "databricks") {
    const model = configRepo.get("mangler_model");
    if (!model) return "";
    return cleanMessage(await completeDatabricks({ model, system: COMMIT_SYSTEM, user, maxTokens: 256 }));
  }
  const res = await getAnthropic().messages.create({
    model: ANTHROPIC_COMMIT_MODEL,
    max_tokens: 256,
    system: COMMIT_SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "text");
  return cleanMessage(block && "text" in block ? block.text : "");
}
