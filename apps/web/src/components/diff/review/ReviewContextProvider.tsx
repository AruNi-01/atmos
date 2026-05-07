"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useReviewContext, type ReviewContext } from "@/hooks/use-review-context";
import type { ReviewTarget } from "@/api/ws-api";

const ReviewCtx = createContext<ReviewContext | null>(null);

interface ReviewContextProviderProps {
  target: ReviewTarget | null;
  filePath: string;
  fileSnapshotGuid?: string | null;
  children: React.ReactNode;
}

export const ReviewContextProvider: React.FC<ReviewContextProviderProps> = ({
  target,
  filePath,
  fileSnapshotGuid,
  children,
}) => {
  const ctx = useReviewContext({ target, filePath, fileSnapshotGuid });

  // Memoize context value to avoid unnecessary re-renders
  const contextValue = useMemo(() => ctx, [
    ctx.sessions,
    ctx.currentSession,
    ctx.currentRevision,
    ctx.currentFile,
    ctx.comments,
    ctx.canEdit,
    ctx.isLoading,
    ctx.isCreating,
    ctx.isCreatingAgentRun,
    ctx.isFinalizingRun,
    ctx.latestSummaryRun,
    ctx.artifactPreview,
    ctx.artifactLoading,
    ctx.selectedSessionGuid,
    ctx.selectedRevisionGuid,
    ctx.terminalAgentId,
    ctx.handleCreateSession,
    ctx.handleCloseSession,
    ctx.handleArchiveSession,
    ctx.handleRenameSession,
    ctx.handleToggleReviewed,
    ctx.handleUpdateCommentStatus,
    ctx.handleReplyToComment,
    ctx.handleUpdateMessage,
    ctx.handleDeleteMessage,
    ctx.createAgentRun,
    ctx.handleCopyAgentPrompt,
    ctx.handleSendAgentRunToAgentChat,
    ctx.handleRunAgentInTerminal,
    ctx.handleRunAgentReview,
    ctx.handleCopyAgentReviewPrompt,
    ctx.handleMarkAgentRunFailed,
    ctx.handleFinalizeRun,
    ctx.handlePreviewArtifact,
  ]);

  return <ReviewCtx.Provider value={contextValue}>{children}</ReviewCtx.Provider>;
};

export function useReviewCtx(): ReviewContext {
  const ctx = useContext(ReviewCtx);
  if (!ctx) {
    throw new Error("useReviewCtx must be used within a ReviewContextProvider");
  }
  return ctx;
}
