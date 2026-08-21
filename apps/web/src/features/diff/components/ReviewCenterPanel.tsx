"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { ReviewTarget } from "@/api/ws-api";
import { ReviewContextProvider } from "@/features/diff/components/review/ReviewContextProvider";
import { ReviewActions } from "@/features/diff/components/review/ReviewActions";

const ReviewView = dynamic(() => import("@/features/diff/components/ReviewView"), {
  ssr: false,
});

export function ReviewCenterPanel({
  filePath,
  reviewTarget,
}: {
  filePath: string;
  reviewTarget: ReviewTarget | null;
}) {
  return (
    <ReviewContextProvider target={reviewTarget} filePath={filePath}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-9 shrink-0 items-center bg-background/50 backdrop-blur-sm">
          <ReviewActions />
        </div>
        <div className="min-h-0 flex-1">
          <ReviewView />
        </div>
      </div>
    </ReviewContextProvider>
  );
}
