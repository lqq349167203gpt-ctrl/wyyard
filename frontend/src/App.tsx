import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AppLayout } from "@/components/layout/app-layout"
import { TooltipProvider } from "@/components/ui/tooltip"
import DashboardPage from "@/pages/dashboard"
import AgentsPage from "@/pages/agents"
import KnowledgePage from "@/pages/knowledge"
import BusinessPage from "@/pages/business"
import SettingsPage from "@/pages/settings"

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/business" element={<BusinessPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App
