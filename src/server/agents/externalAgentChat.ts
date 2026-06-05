import { env } from "../env";
import { conversationsRepo, messagesRepo } from "../db/chat";
import { registeredAgentsRepo } from "../db/registeredAgents";
import { broadcast } from "../realtime/hub";
import { invokeDatabricksAgent } from "./databricks";

// Run one turn of a chat with a registered external agent. The simpler sibling of
// runMangler: a single streamed completion against the agent's endpoint, no tools.
export async function runExternalAgentTurn(conversationId: string): Promise<void> {
  const conversation = conversationsRepo.get(conversationId);
  const agent = conversation?.agentId ? registeredAgentsRepo.get(conversation.agentId) : undefined;
  if (!agent) {
    broadcast({ type: "agent.error", conversationId, error: "agent not found for this conversation" });
    return;
  }
  if (!env.databricksHost || !env.databricksToken) {
    broadcast({ type: "agent.error", conversationId, error: "Databricks not configured (set DATABRICKS_HOST and DATABRICKS_TOKEN)." });
    return;
  }

  const messages = messagesRepo.list(conversationId).map((m) => ({ role: m.role, content: String(m.content) }));

  try {
    const onText = (text: string) => broadcast({ type: "agent.delta", conversationId, text });
    const reply = await invokeDatabricksAgent({ endpoint: agent.endpoint, messages, conversationId, onText });
    messagesRepo.add(conversationId, "assistant", reply);
    broadcast({ type: "agent.done", conversationId });
  } catch (err) {
    broadcast({ type: "agent.error", conversationId, error: (err as Error).message });
  }
}
