"use client";

import React from "react";
import {
  AnimatedNumber,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TextShimmer,
  cn,
} from "@workspace/ui";
import { WorkspaceSetupProgressView } from "@/components/workspace/WorkspaceSetupProgress";
import type { WorkspaceSetupProgress } from "@/hooks/use-project-store";
import {
  getWorkspaceSetupProgressValue,
  getWorkspaceSetupSteps,
} from "@/utils/workspace-setup";
import { NIL } from "uuid";

interface WorkspaceStatusPopoverProps {
  progress: WorkspaceSetupProgress;
  onFinish: () => void;
}

function ProgressRing({
  progress,
  status,
  highlightReview,
}: {
  progress: number;
  status: WorkspaceSetupProgress["status"];
  highlightReview: boolean;
}) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (progress / 100) * circumference;
  const strokeClass =
    highlightReview
      ? "stroke-amber-500"
      : status === "error"
      ? "stroke-destructive"
      : status === "completed"
        ? "stroke-emerald-500"
        : "stroke-primary";
  const numberClass = highlightReview ? "text-amber-500" : "text-foreground";

  return (
    <div className="relative flex size-[22px] shrink-0 items-center justify-center">
      <svg className="-rotate-90" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle
          cx="11"
          cy="11"
          r={radius}
          fill="none"
          className="stroke-border/60"
          strokeWidth="1.75"
        />
        <circle
          cx="11"
          cy="11"
          r={radius}
          fill="none"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={cn("transition-all duration-1000 ease-out", strokeClass)}
        />
      </svg>
      <AnimatedNumber
        value={progress}
        springOptions={{ stiffness: 55, damping: 18, mass: 1.25 }}
        className={cn(
          "absolute inset-0 flex items-center justify-center text-[7px] font-semibold",
          numberClass,
        )}
      />
    </div>
  );
}

export function WorkspaceStatusPopover({
  progress,
  onFinish,
}: WorkspaceStatusPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const progressValue = Math.round(getWorkspaceSetupProgressValue(progress));
  const isReviewingTodos = progress.requiresConfirmation === true;
  const stepCount = getWorkspaceSetupSteps(progress).length;
  const popoverWidthClass =
    stepCount <= 3
      ? "w-[720px] max-w-[min(720px,calc(100vw-24px))]"
      : stepCount === 4
        ? "w-[840px] max-w-[min(840px,calc(100vw-24px))]"
        : "w-[960px] max-w-[min(960px,calc(100vw-24px))]";

  React.useEffect(() => {
    if (progress.status !== "completed") {
      return;
    }

    const timer = window.setTimeout(() => {
      setOpen(false);
      onFinish();
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [onFinish, progress.status]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="grid h-7 max-w-[280px] grid-cols-[22px_minmax(0,1fr)_2px] items-center gap-2 rounded-md border border-transparent bg-muted/40 pl-2 pr-1 text-left transition-colors hover:border-border hover:bg-muted/60"
          aria-label={`Workspace status: ${progress.stepTitle}`}
        >
          <ProgressRing
            progress={progressValue}
            status={progress.status}
            highlightReview={isReviewingTodos}
          />
          <div className="min-w-0 overflow-hidden text-center">
            <TextShimmer
              as="span"
              duration={1.6}
              className="block truncate text-center text-[12px] font-medium"
              style={
                isReviewingTodos
                  ? ({
                      "--base-color": "rgb(201 153 29 / 0.6)",
                      "--base-gradient-color": "rgb(263 197 39)",
                    } as React.CSSProperties)
                  : null
              }
            >
              {progress.stepTitle}
            </TextShimmer>
          </div>
          <span aria-hidden="true" className="block h-[22px] w-0.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className={cn(
          popoverWidthClass,
          "border border-border/70 bg-popover/96 p-0 shadow-xl",
        )}
      >
        <WorkspaceSetupProgressView progress={progress} onFinish={onFinish} compact />
      </PopoverContent>
    </Popover>
  );
}
