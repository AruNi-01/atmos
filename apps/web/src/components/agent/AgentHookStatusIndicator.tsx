"use client";

import React, { useState, useEffect, useRef } from "react";
import { TextShimmer, FilledBellIcon, cn } from "@workspace/ui";
import type { AnimatedIconHandle } from "@workspace/ui";
import { AGENT_STATE, type AgentHookState } from "@/hooks/use-agent-hooks-store";

const SPINNER_NAMES = [
  "braille", "helix", "scan", "cascade", "orbit",
  "snake", "breathe", "pulse", "dna", "rain",
] as const;

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BRAILLE_INTERVAL = 80;

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

const STATE_DOT_COLORS: Record<AgentHookState, string> = {
  [AGENT_STATE.IDLE]: "bg-emerald-500/70",
  [AGENT_STATE.RUNNING]: "bg-blue-500",
  [AGENT_STATE.PERMISSION_REQUEST]: "bg-amber-500",
};

function useLoopingBell(ref: React.RefObject<AnimatedIconHandle | null>, intervalMs = 2000) {
  useEffect(() => {
    const timer = setInterval(() => {
      ref.current?.startAnimation();
    }, intervalMs);
    ref.current?.startAnimation();
    return () => clearInterval(timer);
  }, [ref, intervalMs]);
}

function PermissionBellCompact() {
  const bellRef = useRef<AnimatedIconHandle>(null);
  useLoopingBell(bellRef);
  return (
    <span className="inline-flex items-center justify-center size-5 text-amber-400/70" title="Permission requested">
      <FilledBellIcon ref={bellRef} size={14} color="currentColor" strokeWidth={0} />
    </span>
  );
}

function PermissionBellFull({ tool }: { tool?: string }) {
  const bellRef = useRef<AnimatedIconHandle>(null);
  useLoopingBell(bellRef);
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-flex items-center text-amber-400/70">
        <FilledBellIcon ref={bellRef} size={14} color="currentColor" strokeWidth={0} />
      </span>
      <TextShimmer as="span" className="text-[10px] whitespace-nowrap text-amber-400/60" duration={2}>
        {tool ? `${tool}: Waiting for permission` : "Waiting for permission"}
      </TextShimmer>
    </div>
  );
}

function CompactIndicator({ state }: { state: AgentHookState }) {
  const spinnerChar = useBrailleSpinner();

  if (state === AGENT_STATE.IDLE) {
    return null;
  }

  if (state === AGENT_STATE.PERMISSION_REQUEST) {
    return <PermissionBellCompact />;
  }

  return (
    <span className="inline-flex items-center justify-center size-5 font-mono text-sm text-blue-400" title="Agent running">
      {spinnerChar}
    </span>
  );
}

function RunningFullSpinner({ tool }: { tool?: string }) {
  const spinnerChar = useFullSpinner();
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-flex items-center font-mono text-[11px] leading-none text-muted-foreground/80 dark:text-muted-foreground">
        {spinnerChar}
      </span>
      <TextShimmer as="span" className="text-[10px] whitespace-nowrap" duration={1.5}>
        {tool ? `${tool}: Running` : "Agent running"}
      </TextShimmer>
    </div>
  );
}

function FullIndicator({ state, tool }: { state: AgentHookState; tool?: string }) {
  if (state === AGENT_STATE.IDLE) {
    return (
      <div className="flex items-center gap-1.5">
        <div className={cn("size-2 rounded-full", STATE_DOT_COLORS[AGENT_STATE.IDLE])} />
        <span className="text-[10px] text-muted-foreground">
          {tool ? `${tool}: ` : "Agent: "}IDLE
        </span>
      </div>
    );
  }

  if (state === AGENT_STATE.PERMISSION_REQUEST) {
    return <PermissionBellFull tool={tool} />;
  }

  return <RunningFullSpinner tool={tool} />;
}

export function AgentHookStatusIndicator({
  state,
  variant = "compact",
  className,
  tool,
}: AgentHookStatusIndicatorProps) {
  return (
    <div className={cn("flex items-center whitespace-nowrap", className)}>
      {variant === "compact" ? (
        <CompactIndicator state={state} />
      ) : (
        <FullIndicator state={state} tool={tool} />
      )}
    </div>
  );
}
