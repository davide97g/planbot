import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { isAuthenticated, clearToken } from "@/lib/auth";
import { LoginPage } from "@/components/LoginPage";
import { ChatContainer } from "@/components/ChatContainer";
import SettingsPage from "@/components/SettingsPage";

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
