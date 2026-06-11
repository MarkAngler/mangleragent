import { Routes, Route } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ToastProvider } from "./components/Toast";
import { PageTitleProvider } from "./components/PageTitleProvider";
import { AttentionProvider } from "./components/AttentionProvider";
import { ManglerPage } from "./pages/ManglerPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { BoardPage } from "./pages/BoardPage";
import { ActiveAgentsPage } from "./pages/ActiveAgentsPage";
import { AgentBuilderPage } from "./pages/AgentBuilderPage";
import { AgentChatPage } from "./pages/AgentChatPage";
import { ExternalAgentsPage } from "./pages/ExternalAgentsPage";
import { ExternalAgentChatPage } from "./pages/ExternalAgentChatPage";
import { McpServersPage } from "./pages/McpServersPage";
import { NotesPage } from "./pages/NotesPage";
import { SchedulesPage } from "./pages/SchedulesPage";
import { DefinitionsPage } from "./pages/DefinitionsPage";
import { GithubSyncPage } from "./pages/GithubSyncPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <ToastProvider>
      <PageTitleProvider>
        <AttentionProvider>
          <AppShell>
            <Routes>
              <Route path="/" element={<ManglerPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:id" element={<BoardPage />} />
              <Route path="/agents" element={<ActiveAgentsPage />} />
              <Route path="/agent-builder" element={<AgentBuilderPage />} />
              <Route path="/agent-builder/:id" element={<AgentChatPage />} />
              <Route path="/external-agents" element={<ExternalAgentsPage />} />
              <Route path="/external-agents/:id" element={<ExternalAgentChatPage />} />
              <Route path="/mcp-servers" element={<McpServersPage />} />
              <Route path="/notes" element={<NotesPage />} />
              <Route path="/schedules" element={<SchedulesPage />} />
              <Route path="/definitions" element={<DefinitionsPage />} />
              <Route path="/definitions/github" element={<GithubSyncPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </AppShell>
        </AttentionProvider>
      </PageTitleProvider>
    </ToastProvider>
  );
}
