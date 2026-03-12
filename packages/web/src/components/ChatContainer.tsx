import { useEffect, useState } from "react";
import { useChat } from "@/hooks/useChat";
import { useAtlassianStatus } from "@/hooks/useAtlassianStatus";
import { useTaskStore } from "@/hooks/useTaskStore";
import { useSlackChannels } from "@/hooks/useSlackChannels";
import { ConversationSidebar } from "./ConversationSidebar";
import { TaskSidebar } from "./TaskSidebar";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoinsIcon, DatabaseIcon } from "lucide-react";
import { PlanBotLogo } from "./PlanBotLogo";
import { DemoDataDialog } from "./DemoDataDialog";

const SIDEBAR_COLLAPSED_KEY = "planbot_sidebar_collapsed";

interface ChatContainerProps {
  onLogout: () => void;
}

export function ChatContainer({ onLogout }: ChatContainerProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored !== null ? stored === "true" : true; // default collapsed
  });
  const [demoDialogOpen, setDemoDialogOpen] = useState(false);
  const taskStore = useTaskStore();
  const chat = useChat({
    onTaskCreate: (title) => taskStore.addTask(title, "ai"),
  });
  const atlassianStatus = useAtlassianStatus();
  const slackChannels = useSlackChannels();

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  useEffect(() => {
    chat.loadConversations();
  }, []);

  useEffect(() => {
    if (!chat.isStreaming && chat.conversationId) {
      chat.loadConversations();
    }
  }, [chat.isStreaming, chat.conversationId]);

  return (
    <div className="flex h-screen bg-background">
      <ConversationSidebar
        conversations={chat.conversations}
        activeId={chat.conversationId}
        onSelect={(id) => chat.loadConversation(id)}
        onNew={chat.newConversation}
        onDelete={(id) => chat.deleteConversation(id)}
        onRename={(id, title) => chat.renameConversation(id, title)}
        onLogout={onLogout}
        atlassianStatus={atlassianStatus}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
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

        <ChatInput
          onSend={chat.sendMessage}
          isStreaming={chat.isStreaming}
          tasks={taskStore.tasks}
          slackChannels={slackChannels}
        />
      </div>

      <TaskSidebar
        tasks={taskStore.tasks}
        onAdd={(title) => taskStore.addTask(title)}
        onToggle={taskStore.toggleTask}
        onDelete={taskStore.deleteTask}
        onReorder={taskStore.reorderTasks}
        onClearCompleted={taskStore.clearCompleted}
      />

      <DemoDataDialog open={demoDialogOpen} onOpenChange={setDemoDialogOpen} />
    </div>
  );
}
