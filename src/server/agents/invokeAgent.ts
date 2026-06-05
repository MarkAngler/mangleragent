import type { RegisteredAgent } from "../../shared/types";
import { invokeDatabricksAgent } from "./databricks";
import { askGenie } from "./genie";

// Transport for a registered external agent, dispatched on provider. DB-free: callers that want
// multi-turn Genie memory pass genieConversationId in and persist the returned one themselves.
export async function invokeRegisteredAgent(
  agent: RegisteredAgent,
  args: {
    messages: { role: "user" | "assistant"; content: string }[];
    conversationId?: string;
    genieConversationId?: string;
    onText?: (text: string) => void;
  },
): Promise<{ reply: string; genieConversationId?: string }> {
  if (agent.provider === "databricks_genie") {
    const content = [...args.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const { reply, conversationId } = await askGenie({ spaceId: agent.endpoint, content, genieConversationId: args.genieConversationId });
    return { reply, genieConversationId: conversationId };
  }
  const reply = await invokeDatabricksAgent({
    endpoint: agent.endpoint,
    messages: args.messages,
    conversationId: args.conversationId,
    onText: args.onText,
  });
  return { reply };
}
