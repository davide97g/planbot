import { useState } from "react";
import { isAuthenticated, clearToken } from "@/lib/auth";
import { LoginPage } from "@/components/LoginPage";
import { ChatContainer } from "@/components/ChatContainer";

function App() {
  const [authed, setAuthed] = useState(isAuthenticated());

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return (
    <ChatContainer
      onLogout={() => {
        clearToken();
        setAuthed(false);
      }}
    />
  );
}

export default App;
