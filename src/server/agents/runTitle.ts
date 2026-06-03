import { configRepo } from "../db/config";
import { runsRepo } from "../db/runs";
import { broadcast } from "../realtime/hub";
import { getAnthropic } from "./anthropic";
import { completeDatabricks } from "./databricks";

const ANTHROPIC_TITLE_MODEL = "claude-haiku-4-5-20251001";
const TITLE_SYSTEM =
  "Generate a concise title (max 6 words) for the task below. Reply with ONLY the title — no quotes, no trailing punctuation.";

export function truncateForTitle(text: string, max = 60): string {
  const trimmed = text.trim();
  return trimmed.length > max ? trimmed.slice(0, max).trimEnd() + "…" : trimmed;
}

function cleanTitle(raw: string): string {
  return truncateForTitle(raw.replace(/^title:\s*/i, "").replace(/^["']|["']$/g, ""));
}

// Ask the LLM for a short descriptive title for a run, using the same provider
// the user configured for Mangler chat so it works without an Anthropic key.
async function titleFromPrompt(prompt: string): Promise<string> {
  const user = prompt.slice(0, 2000);
  if ((configRepo.get("mangler_provider") ?? "anthropic") === "databricks") {
    const model = configRepo.get("mangler_model");
    if (!model) return "";
    return cleanTitle(await completeDatabricks({ model, system: TITLE_SYSTEM, user, maxTokens: 24 }));
  }
  const res = await getAnthropic().messages.create({
    model: ANTHROPIC_TITLE_MODEL,
    max_tokens: 24,
    system: TITLE_SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "text");
  return cleanTitle(block && "text" in block ? block.text : "");
}

// Derive a descriptive run title from the agent's initial prompt, then persist
// it and notify clients. Fire-and-forget: any failure leaves the synchronous
// fallback title (set at run creation) in place.
export async function generateAndSetRunTitle(runId: string, prompt: string): Promise<void> {
  try {
    const title = await titleFromPrompt(prompt);
    if (!title) return;
    runsRepo.setTitle(runId, title);
    broadcast({ type: "run.updated", runId });
  } catch {
    // Keep the fallback title.
  }
}
