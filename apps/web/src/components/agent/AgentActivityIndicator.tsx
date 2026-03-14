"use client";

import React, { useState, useEffect } from "react";
import { TextShimmer } from "@workspace/ui";
import type { AgentActivity } from "./chat-helpers";

const SPINNER_NAMES = [
  "braille", "helix", "scan", "cascade", "orbit",
  "snake", "breathe", "pulse", "dna", "rain",
] as const;

function useUnicodeSpinner() {
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

export function AgentActivityIndicator({ activity }: { activity: AgentActivity & { busy: true } }) {
  const spinnerChar = useUnicodeSpinner();

  return (
    <div className="flex items-center gap-2 px-1 py-1.5 text-sm">
      <span className="inline-flex items-center font-mono text-sm leading-none text-muted-foreground/80 dark:text-muted-foreground">
        {spinnerChar}
      </span>
      <TextShimmer
        as="span"
        className="translate-y-px text-sm"
        duration={1.5}
      >
        {`${activity.label}...`}
      </TextShimmer>
    </div>
  );
}
