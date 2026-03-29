"use client";

import React, { useState, useEffect } from "react";
import { TextShimmer, cn } from "@workspace/ui";

const SPINNER_NAMES = [
  "braille", "helix", "scan", "cascade", "orbit",
  "snake", "breathe", "pulse", "dna", "rain",
] as const;

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BRAILLE_INTERVAL = 80;

type AgentHookState = "idle" | "running" | "permission_request";

function useBrailleSpinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % BRAILLE_FRAMES.length);
    }, BRAILLE_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  return BRAILLE_FRAMES[frame];
}

function useFullSpinner() {
  const [frame, setFrame] = useState(0);
  const [spinner, setSpinner] = useState<{ frames: readonly string[]; interval: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const name = SPINNER_NAMES[Math.floor(Math.random() * SPINNER_NAMES.length)];

    import("unicode-animations").then((mod) => {
      if (cancelled) return;
      const spinners = mod.default ?? mod;
      const s = spinners[name as keyof typeof spinners];
      if (s) setSpinner(s);
    });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!spinner) return;
    const timer = setInterval(() => {
      setFrame((f) => f + 1);
    }, spinner.interval);
    return () => clearInterval(timer);
  }, [spinner]);

  if (!spinner) return "⠋";
  return spinner.frames[frame % spinner.frames.length];
}

export type AgentHookIndicatorVariant = "compact" | "full";

interface AgentHookStatusIndicatorProps {
  state: AgentHookState;
  variant?: AgentHookIndicatorVariant;
  className?: string;
  tool?: string;
}

const STATE_LABELS: Record<AgentHookState, string> = {
  idle: "IDLE",
  running: "Running",
  permission_request: "Waiting",
};

const STATE_DOT_COLORS: Record<AgentHookState, string> = {
  idle: "bg-emerald-500",
  running: "bg-blue-500",
  permission_request: "bg-amber-500",
};

function CompactIndicator({ state }: { state: AgentHookState }) {
  const spinnerChar = useBrailleSpinner();

  if (state === "idle") {
    return null;
  }

  if (state === "permission_request") {
    return (
      <span className="inline-flex items-center justify-center size-4 text-amber-500 animate-pulse" title="Permission requested">
        ●
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-center size-4 font-mono text-[11px] text-blue-400" title="Agent running">
      {spinnerChar}
    </span>
  );
}

function FullIndicator({ state, tool }: { state: AgentHookState; tool?: string }) {
  const spinnerChar = useFullSpinner();

  if (state === "idle") {
    return (
      <div className="flex items-center gap-1.5">
        <div className={cn("size-2 rounded-full", STATE_DOT_COLORS.idle)} />
        <span className="text-[10px] text-muted-foreground">
          {tool ? `${tool}: ` : "Agent: "}IDLE
        </span>
      </div>
    );
  }

  if (state === "permission_request") {
    return (
      <div className="flex items-center gap-1.5">
        <div className={cn("size-2 rounded-full animate-pulse", STATE_DOT_COLORS.permission_request)} />
        <span className="text-[10px] text-amber-500">
          {tool ? `${tool}: ` : ""}Waiting for permission
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-flex items-center font-mono text-[11px] leading-none text-muted-foreground/80 dark:text-muted-foreground">
        {spinnerChar}
      </span>
      <TextShimmer as="span" className="text-[10px]" duration={1.5}>
        {tool ? `${tool}: Running...` : "Agent running..."}
      </TextShimmer>
    </div>
  );
}

export function AgentHookStatusIndicator({
  state,
  variant = "compact",
  className,
  tool,
}: AgentHookStatusIndicatorProps) {
  return (
    <div className={cn("flex items-center", className)}>
      {variant === "compact" ? (
        <CompactIndicator state={state} />
      ) : (
        <FullIndicator state={state} tool={tool} />
      )}
    </div>
  );
}
