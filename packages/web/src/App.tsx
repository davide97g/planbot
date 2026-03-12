import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { isAuthenticated, clearToken } from "@/lib/auth";
import { LoginPage } from "@/components/LoginPage";
import { ChatContainer } from "@/components/ChatContainer";
import SettingsPage from "@/components/SettingsPage";

const OrchestratorMap = lazy(() => import("@/components/OrchestratorMap"));
const MemoryPage = lazy(() => import("@/components/MemoryPage"));

function App() {
  const [authed, setAuthed] = useState(isAuthenticated());

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  const handleLogout = () => {
    clearToken();
    setAuthed(false);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatContainer onLogout={handleLogout} />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route
          path="/memory"
          element={
            <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading…</div>}>
              <MemoryPage />
            </Suspense>
          }
        />
        <Route
          path="/architecture"
          element={
            <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading map...</div>}>
              <OrchestratorMap />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
