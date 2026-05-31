import { Honcho } from "@honcho-ai/sdk";
import { env } from "./env";
import { configRepo } from "./db/config";

// Optional honcho.dev memory. Workspace is overridable so tests can target a
// throwaway workspace without touching the product default.
const WORKSPACE = process.env.MANGLED_HONCHO_WORKSPACE ?? "mangled-agents";
const USER_PEER = "user";
const MANGLER_PEER = "mangler";

let client: Honcho | null = null;

export function honchoConfigured(): boolean {
  return Boolean(env.honchoApiKey);
}

export function honchoEnabled(): boolean {
  return honchoConfigured() && configRepo.getBool("honcho_enabled", false);
}

function getClient(): Honcho {
  if (!client) client = new Honcho({ apiKey: env.honchoApiKey, workspaceId: WORKSPACE, environment: "production" });
  return client;
}

/** Ask honcho's dialectic endpoint what it knows about the user. Returns null when disabled/unavailable. */
export async function recallUserMemory(query: string): Promise<string | null> {
  if (!honchoEnabled()) return null;
  try {
    const user = await getClient().peer(USER_PEER);
    return await user.chat(query);
  } catch (err) {
    console.warn("honcho recall failed:", (err as Error).message);
    return null;
  }
}

/** Persist one user/assistant exchange into the conversation's honcho session. No-op when disabled. */
export async function recordTurn(conversationId: string, userText: string, assistantText: string): Promise<void> {
  if (!honchoEnabled() || (!userText && !assistantText)) return;
  try {
    const honcho = getClient();
    const [user, mangler, session] = await Promise.all([
      honcho.peer(USER_PEER),
      honcho.peer(MANGLER_PEER),
      honcho.session(conversationId),
    ]);
    const messages = [];
    if (userText) messages.push(user.message(userText));
    if (assistantText) messages.push(mangler.message(assistantText));
    await session.addMessages(messages);
  } catch (err) {
    console.warn("honcho record failed:", (err as Error).message);
  }
}
