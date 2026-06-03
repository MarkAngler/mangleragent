import { Routes, Route } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ManglerPage } from "./pages/ManglerPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { BoardPage } from "./pages/BoardPage";
import { ActiveAgentsPage } from "./pages/ActiveAgentsPage";
import { NotesPage } from "./pages/NotesPage";
import { SchedulesPage } from "./pages/SchedulesPage";
import { DefinitionsPage } from "./pages/DefinitionsPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<ManglerPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<BoardPage />} />
        <Route path="/agents" element={<ActiveAgentsPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/schedules" element={<SchedulesPage />} />
        <Route path="/definitions" element={<DefinitionsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </AppShell>
  );
}
