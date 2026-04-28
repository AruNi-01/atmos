"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Input,
} from "@workspace/ui";
import { ChevronDown, Check, LoaderCircle, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReviewCtx } from "@/components/diff/review/ReviewContextProvider";
import { FixActionsMenu } from "@/components/diff/review/FixActionsMenu";
import { RevisionPicker } from "@/components/diff/review/RevisionPicker";
import { sessionStatusTone } from "@/components/diff/review/utils";

export const ReviewActions: React.FC = () => {
  const {
    sessions,
    currentSession,
    currentRevision,
    canEdit,
    openRevisionThreads,
    isCreating,
    isCreatingFixRun,
    terminalAgentId,
    setTerminalAgentId,
    handleCreateSession,
    handleCloseSession,
    handleArchiveSession,
    handleRenameSession,
    handleCopyFixPrompt,
    handleRunFixInTerminal,
    loadSessions,
    loadThreads,
    setSelectedSessionGuid,
    setSelectedRevisionGuid,
    setArtifactPreview,
  } = useReviewCtx();

  const revisionLabel = useMemo(() => {
    if (!currentSession || !currentRevision) return "Live";
    const sorted = [...currentSession.revisions].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
    const idx = sorted.findIndex((r) => r.guid === currentRevision.guid);
    return idx >= 0 ? `v${idx + 1}` : "Revision";
  }, [currentRevision, currentSession]);

  const fixDisabled = !canEdit || openRevisionThreads.length === 0;

  const isRefreshingRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    try {
      await Promise.all([loadSessions(), loadThreads()]);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
        isRefreshingRef.current = false;
      }, 300);
    }
  }, [loadSessions, loadThreads]);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const handleOpenRename = useCallback(() => {
    setRenameValue(currentSession?.title ?? "");
    setRenameOpen(true);
  }, [currentSession?.title]);
  const handleSubmitRename = useCallback(async () => {
    if (!renameValue.trim()) return;
    await handleRenameSession(renameValue.trim());
    setRenameOpen(false);
  }, [handleRenameSession, renameValue]);

  return (
    <div className="flex-1 flex items-center justify-between gap-1.5">
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <div className="flex-1 flex items-stretch rounded-md">
        {sessions.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-l-md border border-r-0 border-sidebar-border px-2.5 py-1 text-[13px] text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer truncate flex-1 min-w-0"
                title={currentSession?.title?.trim() || "Session"}
              >
                <span className="font-medium shrink-0">{revisionLabel}</span>
                <span className="text-muted-foreground truncate">{currentSession?.title?.trim() || "Session"}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[12rem]">
              {sessions.map((s) => (
                <DropdownMenuItem
                  key={s.guid}
                  onClick={() => {
                    setSelectedSessionGuid(s.guid);
                    setSelectedRevisionGuid(null);
                    setArtifactPreview(null);
                  }}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="flex-1 truncate">{s.title?.trim() || "Review Session"}</span>
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-px text-[10px] font-medium capitalize shrink-0",
                      sessionStatusTone(s.status),
                    )}
                  >
                    {s.status.replaceAll("_", " ")}
                  </span>
                  <Check
                    className={cn(
                      "size-3.5 shrink-0",
                      s.guid === currentSession?.guid
                        ? "text-foreground"
                        : "invisible",
                    )}
                  />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-l-md border border-r-0 border-sidebar-border px-2.5 py-1 text-[13px] truncate flex-1 min-w-0">
            <span className="font-medium shrink-0 text-foreground">{revisionLabel}</span>
            <span className="text-muted-foreground truncate">{currentSession?.title?.trim() || "Session"}</span>
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-r-md border border-sidebar-border px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
              title="Session actions"
            >
              <ChevronDown className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[12rem]">
            <DropdownMenuItem
              onClick={handleCreateSession}
              className="text-xs"
              disabled={isCreating}
            >
              New Session
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleCloseSession}
              className="text-xs"
              disabled={currentSession?.status !== "active"}
            >
              Close Session
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleArchiveSession}
              className="text-xs"
            >
              Archive Session
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <Popover open={renameOpen} onOpenChange={setRenameOpen}>
              <PopoverTrigger asChild>
                <DropdownMenuItem
                  onSelect={(e) => { e.preventDefault(); handleOpenRename(); }}
                  className="text-xs"
                  disabled={currentSession?.status !== "active"}
                >
                  <span className="flex-1">Rename</span>
                  <Pencil className="size-3 text-muted-foreground shrink-0" />
                </DropdownMenuItem>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-56 p-3"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmitRename(); }}
                  className="text-xs"
                />
                <div className="flex justify-end gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setRenameOpen(false)}
                    className="px-2.5 py-1 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitRename}
                    className="px-2.5 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </PopoverContent>
            </Popover>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => handleCopyFixPrompt()}
              className="text-xs"
              disabled={fixDisabled}
            >
              Copy Revision Prompt
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleRunFixInTerminal()}
              className="text-xs"
              disabled={fixDisabled}
            >
              Run In Terminal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <FixActionsMenu
        disabled={fixDisabled}
        isLoading={isCreatingFixRun}
        agentId={terminalAgentId}
        onAgentChange={setTerminalAgentId}
        onFix={(agentId) => handleRunFixInTerminal(undefined, agentId)}
      />
      </div>

      {(currentSession?.revisions.length ?? 0) > 1 && (
        <RevisionPicker
          revisions={currentSession?.revisions ?? []}
          selectedGuid={currentRevision?.guid ?? null}
          onSelect={setSelectedRevisionGuid}
        />
      )}

      <button
        type="button"
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer disabled:opacity-50 shrink-0"
        title="Refresh review data"
      >
        <LoaderCircle className={cn("size-3.5", isRefreshing && "animate-spin")} />
      </button>
    </div>
  );
};
