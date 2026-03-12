import { useEffect, useState } from "react";
import { useChat } from "@/hooks/useChat";
import { useAtlassianStatus } from "@/hooks/useAtlassianStatus";
import { ConversationSidebar } from "./ConversationSidebar";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PanelLeftIcon, CoinsIcon, DatabaseIcon } from "lucide-react";
import { PlanBotLogo } from "./PlanBotLogo";
import { DemoDataDialog } from "./DemoDataDialog";

interface ChatContainerProps {
  onLogout: () => void;
}

export function ChatContainer({ onLogout }: ChatContainerProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [demoDialogOpen, setDemoDialogOpen] = useState(false);
  const chat = useChat();
  const atlassianStatus = useAtlassianStatus();

  useEffect(() => {
    chat.loadConversations();
  }, []);

  useEffect(() => {
    if (!chat.isStreaming && chat.conversationId) {
      chat.loadConversations();
    }
  }, [chat.isStreaming, chat.conversationId]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    if (mq.matches) setSidebarOpen(false);
    const handler = (e: MediaQueryListEvent) => setSidebarOpen(!e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div className="flex h-screen bg-background">
      {sidebarOpen && (
        <ConversationSidebar
          conversations={chat.conversations}
          activeId={chat.conversationId}
          onSelect={(id) => chat.loadConversation(id)}
          onNew={chat.newConversation}
          onDelete={(id) => chat.deleteConversation(id)}
          onRename={(id, title) => chat.renameConversation(id, title)}
          onCollapse={() => setSidebarOpen(false)}
          onLogout={onLogout}
          atlassianStatus={atlassianStatus}
        />
      )}

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          {!sidebarOpen && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelLeftIcon className="size-4" />
            </Button>
          )}
          <PlanBotLogo className="size-6 rounded-md" />
          <h1 className="text-sm font-semibold truncate">
            {chat.conversationTitle || "New conversation"}
          </h1>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {chat.currentAgent && (
              <Badge variant="outline" className="text-xs">
                {chat.currentAgent}
              </Badge>
            )}
            {chat.totalTokenUsage.totalTokens > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                <CoinsIcon className="size-2.5" />
                <span>{chat.totalTokenUsage.totalTokens.toLocaleString()} tokens</span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => setDemoDialogOpen(true)}
            >
              <DatabaseIcon className="size-3.5" />
              Generate Demo Data
            </Button>
          </div>
        </header>

        <MessageList messages={chat.messages} isStreaming={chat.isStreaming} />

        {chat.error && (
          <div className="mx-auto max-w-3xl px-4 pb-2">
            <p className="text-sm text-destructive">{chat.error}</p>
          </div>
        )}

        <ChatInput onSend={chat.sendMessage} isStreaming={chat.isStreaming} />
      </div>

      <DemoDataDialog open={demoDialogOpen} onOpenChange={setDemoDialogOpen} />
    </div>
  );
}
