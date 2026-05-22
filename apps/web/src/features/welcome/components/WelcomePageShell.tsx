"use client";

import dynamic from "next/dynamic";
import { ChevronDown } from "lucide-react";

import { Button, cn } from "@workspace/ui";

const PixelBlast = dynamic(
  () => import("@workspace/ui/components/ui/pixel-blast"),
  { ssr: false },
);

export function WelcomePageMountedSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "min-h-full overflow-hidden bg-background px-4 py-8 selection:bg-foreground/10 sm:px-6",
        className,
      )}
    >
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center py-8">
        <div className="mb-10 flex w-full max-w-4xl justify-center">
          <div className="h-16 w-[min(92vw,980px)] animate-pulse rounded-2xl bg-muted/40 sm:h-20 md:h-24" />
        </div>

        <div className="w-full max-w-4xl rounded-2xl border border-border/60 bg-background p-4 shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-md sm:p-6">
          <div className="h-[88px] w-full animate-pulse rounded-xl bg-muted/35" />

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="h-9 w-28 animate-pulse rounded-full bg-muted/35" />
              <div className="h-9 w-56 animate-pulse rounded-full bg-muted/35" />
            </div>
            <div className="h-12 w-12 animate-pulse rounded-full bg-muted/35" />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/50 px-1 pt-4">
            <div className="h-9 w-28 animate-pulse rounded-full bg-muted/35" />
            <div className="h-9 w-32 animate-pulse rounded-full bg-muted/35" />
            <div className="h-9 w-24 animate-pulse rounded-full bg-muted/35" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function WelcomePageBackdrop() {
  return (
    <div className="absolute inset-0 z-0">
      <PixelBlast
        variant="circle"
        pixelSize={6}
        color="#999999"
        patternScale={3}
        patternDensity={1}
        pixelSizeJitter={0.5}
        enableRipples
        rippleSpeed={0.2}
        rippleThickness={0.12}
        rippleIntensityScale={1}
        speed={0.2}
        edgeFade={0.25}
        centerFade={0.85}
        centerRadius={0.45}
        transparent
      />
    </div>
  );
}

export function WelcomeCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="group absolute left-1/2 top-0 z-20 -translate-x-1/2 flex cursor-pointer flex-col items-center gap-0 px-6 py-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
      aria-label="Close"
    >
      <ChevronDown className="h-5 w-9 animate-[bounce-down_1.6s_ease-in-out_infinite]" strokeWidth={1.2} />
      <ChevronDown className="h-5 w-9 -mt-2.5 animate-[bounce-down_1.6s_ease-in-out_0.15s_infinite]" strokeWidth={1.2} />
    </button>
  );
}

export function WelcomeComposerPlaceholder({
  exitingPlaceholder,
  visiblePlaceholder,
}: {
  exitingPlaceholder: string | null;
  visiblePlaceholder: string;
}) {
  return (
    <span className="flex items-baseline gap-1 overflow-hidden">
      <span className="relative shrink-0 whitespace-nowrap">
        <span
          key={visiblePlaceholder}
          className="welcome-placeholder-enter block whitespace-nowrap"
        >
          {visiblePlaceholder}
        </span>
        {exitingPlaceholder ? (
          <span
            key={`exit-${exitingPlaceholder}`}
            className="welcome-placeholder-exit pointer-events-none absolute left-0 top-0 block whitespace-nowrap"
          >
            {exitingPlaceholder}
          </span>
        ) : null}
      </span>
      <span
        key={`hint-${visiblePlaceholder}`}
        className="welcome-placeholder-hint min-w-0 flex-1 truncate text-muted-foreground/45"
      >
        (@ mention , / command, or paste img directly)
      </span>
    </span>
  );
}

export function WelcomeProjectRequirementNotice({
  isInitialProjectsLoading,
  onAddProject,
  projectCount,
}: {
  isInitialProjectsLoading: boolean;
  onAddProject?: () => void;
  projectCount: number;
}) {
  if (isInitialProjectsLoading) {
    return (
      <div className="mt-5 rounded-2xl border border-border/60 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
        Loading your projects and workspaces...
      </div>
    );
  }

  if (projectCount > 0) return null;

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
      <span>Add a project before creating a workspace from the welcome composer.</span>
      <Button type="button" variant="outline" className="rounded-md" onClick={onAddProject}>
        Add Project
      </Button>
    </div>
  );
}
