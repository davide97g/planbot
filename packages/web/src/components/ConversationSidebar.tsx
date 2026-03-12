import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PlusIcon,
  Trash2Icon,
  PencilIcon,
  MessageSquareIcon,
  PanelLeftCloseIcon,
  LogOutIcon,
  Loader2Icon,
  SettingsIcon,
  HistoryIcon,
} from "lucide-react";
import { clearToken } from "@/lib/auth";
import { PlanBotLogo } from "./PlanBotLogo";
import type { AtlassianStatus } from "@/hooks/useAtlassianStatus";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onLogout: () => void;
  atlassianStatus: AtlassianStatus;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const AtlassianIcon = ({ className }: { className?: string }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005z" />
    <path d="M6.016 6.28H17.58a5.218 5.218 0 0 0-5.232-5.215h-2.13V1.008A5.215 5.215 0 0 0 5.012 6.22v.06" />
  </svg>
);

function AtlassianButton({ status, collapsed }: { status: AtlassianStatus; collapsed: boolean }) {
  if (status.loading) {
    return (
      <Button
        variant="ghost"
        className={collapsed ? "w-full justify-center" : "w-full justify-start gap-2 text-muted-foreground"}
        size="sm"
        disabled
      >
        <Loader2Icon className="size-4 animate-spin opacity-50" />
        {!collapsed && "Atlassian…"}
      </Button>
    );
  }

  if (status.error) {
    return (
      <Button
        variant="ghost"
        className={collapsed ? "w-full justify-center" : "w-full justify-start gap-2 text-destructive"}
        size="sm"
        onClick={status.connected ? status.disconnect : status.connect}
      >
        <AtlassianIcon className="size-4" />
        {!collapsed && status.error}
      </Button>
    );
  }

  if (status.connected) {
    return (
      <Button
        variant="ghost"
        className={collapsed ? "w-full justify-center" : "w-full justify-start gap-2 text-green-600 hover:text-red-600 hover:bg-red-50"}
        size="sm"
        onClick={status.disconnect}
      >
        <AtlassianIcon className="size-4" />
        {!collapsed && "Atlassian connected"}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      className={collapsed ? "w-full justify-center" : "w-full justify-start gap-2 text-muted-foreground border border-dashed"}
      size="sm"
      onClick={status.connect}
    >
      <AtlassianIcon className="size-4" />
      {!collapsed && "Connect Atlassian"}
    </Button>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onLogout,
  atlassianStatus,
  collapsed,
  onToggleCollapse,
}: ConversationSidebarProps) {
  const navigate = useNavigate();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = (id: string, currentTitle: string) => {
    setRenamingId(id);
    setRenameValue(currentTitle);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const confirmRename = () => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const cancelRename = () => {
    setRenamingId(null);
  };

  const handleConfirmDelete = () => {
    if (deleteId) {
      onDelete(deleteId);
      setDeleteId(null);
    }
  };

  // Collapsed icon rail view
  if (collapsed) {
    return (
      <TooltipProvider delay={200}>
        <div className="flex h-full w-12 flex-col items-center border-r border-border bg-card py-3 gap-2">
          <Tooltip>
            <TooltipTrigger
              onClick={onNew}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
            >
              <PlusIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="right">New chat</TooltipContent>
          </Tooltip>

          <Separator className="my-1 w-6" />

          <Tooltip>
            <TooltipTrigger
              onClick={onToggleCollapse}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
            >
              <HistoryIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="right">Chat history</TooltipContent>
          </Tooltip>

          <div className="flex flex-col items-center gap-1 mt-auto">
            <Separator className="mb-1 w-6" />
            <Tooltip>
              <TooltipTrigger
                onClick={() => navigate("/settings")}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
              >
                <SettingsIcon className="size-4" />
              </TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                onClick={() => {
                  clearToken();
                  onLogout();
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
              >
                <LogOutIcon className="size-4" />
              </TooltipTrigger>
              <TooltipContent side="right">Sign out</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  // Expanded view
  return (
    <div className="flex h-full w-70 flex-col border-r border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <PlanBotLogo className="size-5 rounded" />
          <h2 className="text-sm font-semibold">PlanBot</h2>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onToggleCollapse}>
          <PanelLeftCloseIcon className="size-4" />
        </Button>
      </div>

      {/* New chat button */}
      <div className="px-3 pb-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={onNew}
        >
          <PlusIcon className="size-4" />
          New Chat
        </Button>
      </div>

      <Separator />

      {/* Conversation list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-0.5 p-2">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No conversations yet
            </p>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm cursor-pointer transition-colors ${
                activeId === conv.id
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted"
              }`}
              onClick={() => {
                if (renamingId !== conv.id) onSelect(conv.id);
              }}
            >
              <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                {renamingId === conv.id ? (
                  <input
                    ref={renameInputRef}
                    className="w-full bg-transparent text-sm font-medium outline-none border-b border-primary"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); confirmRename(); }
                      if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
                    }}
                    onBlur={cancelRename}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <p className="truncate font-medium">{conv.title || "Untitled"}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatRelativeTime(conv.updatedAt)}
                </p>
              </div>
              {renamingId !== conv.id && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(conv.id, conv.title || "");
                    }}
                  >
                    <PencilIcon className="size-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteId(conv.id);
                    }}
                  >
                    <Trash2Icon className="size-3.5 text-muted-foreground" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer */}
      <Separator />
      <div className="p-3 flex flex-col gap-1">
        <AtlassianButton status={atlassianStatus} collapsed={false} />
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          size="sm"
          onClick={() => navigate("/settings")}
        >
          <SettingsIcon className="size-4" />
          Settings
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          size="sm"
          onClick={() => {
            clearToken();
            onLogout();
          }}
        >
          <LogOutIcon className="size-4" />
          Sign out
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete conversation?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The conversation and all its messages
              will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
