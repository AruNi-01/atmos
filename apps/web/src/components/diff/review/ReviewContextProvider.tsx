"use client";

import React, { createContext, useContext } from "react";
import { useReviewContext, type ReviewContext } from "@/hooks/use-review-context";

const ReviewCtx = createContext<ReviewContext | null>(null);

interface ReviewContextProviderProps {
  workspaceId: string | null;
  filePath: string;
  children: React.ReactNode;
}

export const ReviewContextProvider: React.FC<ReviewContextProviderProps> = ({
  workspaceId,
  filePath,
  children,
}) => {
  const ctx = useReviewContext({ workspaceId, filePath });

  return <ReviewCtx.Provider value={ctx}>{children}</ReviewCtx.Provider>;
};

export function useReviewCtx(): ReviewContext {
  const ctx = useContext(ReviewCtx);
  if (!ctx) {
    throw new Error("useReviewCtx must be used within a ReviewContextProvider");
  }
  return ctx;
}
