"use client";

/**
 * File Diff gift card — headerless body from beUI FileDiff.
 * Vendored from https://beui.dev/components/agents/file-diff
 * Author: Saurabh / beUI (copy-paste free component).
 * Adapted for @workspace/ui: omits file header, streaming spinner, and collapse chevron
 * (Atmos AgentToolCard owns that chrome). Adds optional character-stream reveal.
 */

import { Check, Copy } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AgentCodeLanguage,
  AgentCodeLine,
  resolveAgentCodeLanguage,
  useAgentCodeTokens,
} from "./agent-code";
import { useSmoothStreamText } from "../ai-elements/smooth-stream-text";
import { SPRING_PRESS } from "../../lib/ease";
import { cn } from "../../lib/utils";
import { truncateFileDiffLines } from "./file-diff-gift-lines";
import type {
  FileDiffGiftStatus,
  FileDiffLine,
  FileDiffLineType,
} from "./file-diff-gift-types";

export type { FileDiffGiftStatus, FileDiffLine, FileDiffLineType };
export { truncateFileDiffLines };

export interface FileDiffGiftProps {
  lines: FileDiffLine[];
  status?: FileDiffGiftStatus;
  /** Prefer character-smooth reveal while streaming (default true). */
  smoothReveal?: boolean;
  maxHeight?: number;
  language?: AgentCodeLanguage | string;
  copyText?: string;
  onCopy?: () => void | Promise<void>;
  className?: string;
}

export function FileDiffGift({
  lines,
  status = "complete",
  smoothReveal = true,
  maxHeight = 280,
  language = "typescript",
  copyText,
  onCopy,
  className,
}: FileDiffGiftProps) {
  const reduce = useReducedMotion() ?? false;
  const viewportRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const streaming = status === "streaming";
  const resolvedLanguage = resolveAgentCodeLanguage(language);
  const canCopy = Boolean(copyText || onCopy);
  const fullCode = useMemo(
    () => lines.map((line) => line.content).join("\n"),
    [lines],
  );
  const revealedCode = useSmoothStreamText(
    fullCode,
    smoothReveal && streaming && !reduce,
  );
  const visibleLines = useMemo(() => {
    if (!(smoothReveal && streaming && !reduce)) return lines;
    if (revealedCode === fullCode) return lines;
    return truncateFileDiffLines(lines, revealedCode.length);
  }, [fullCode, lines, reduce, revealedCode, smoothReveal, streaming]);
  const visibleCode = useMemo(
    () => visibleLines.map((line) => line.content).join("\n"),
    [visibleLines],
  );
  const tokens = useAgentCodeTokens(visibleCode, resolvedLanguage);

  useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !streaming) return;

    const frame = requestAnimationFrame(() => {
      if (viewport.scrollHeight <= viewport.clientHeight) return;
      if (typeof viewport.scrollTo === "function") {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: reduce ? "auto" : "smooth",
        });
      } else {
        viewport.scrollTop = viewport.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  const handleCopy = useCallback(async () => {
    if (onCopy) await onCopy();
    else if (copyText) await navigator.clipboard?.writeText(copyText);

    setCopied(true);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  }, [copyText, onCopy]);

  return (
    <div
      data-slot="file-diff-gift"
      data-state={status}
      aria-busy={streaming}
      className={cn("overflow-hidden rounded-xl bg-muted/80 text-sm", className)}
    >
      <div
        ref={viewportRef}
        data-slot="file-diff-viewport"
        aria-live="polite"
        className="scrollbar-hide overflow-auto"
        style={{ maxHeight }}
      >
        <div className="font-mono text-xs leading-5">
          <span className="sr-only">File changes</span>
          {visibleLines.map((line, index) => {
            const type = line.type ?? "context";
            return (
              <div
                key={line.id}
                className={cn(
                  "grid grid-cols-[2.25rem_2.25rem_1rem_minmax(0,1fr)]",
                  type === "added" && "bg-emerald-500/[0.07]",
                  type === "removed" && "bg-rose-500/[0.07]",
                )}
              >
                <span className="select-none pr-2 text-right tabular-nums text-muted-foreground/40">
                  {line.oldLine}
                </span>
                <span className="select-none pr-2 text-right tabular-nums text-muted-foreground/40">
                  {line.newLine}
                </span>
                <span
                  className={cn(
                    "select-none text-center text-muted-foreground/45",
                    type === "added" &&
                      "text-emerald-600 dark:text-emerald-400",
                    type === "removed" &&
                      "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {type === "added" ? "+" : type === "removed" ? "−" : ""}
                </span>
                <AgentCodeLine
                  code={line.content}
                  tokens={tokens?.[index]}
                  className="min-w-0 whitespace-pre px-1.5 text-foreground/85"
                />
              </div>
            );
          })}
        </div>
      </div>

      {canCopy ? (
        <div className="flex justify-end px-2 pb-1.5 pt-1">
          <motion.button
            type="button"
            aria-label={copied ? "Copied" : "Copy diff"}
            title={copied ? "Copied" : "Copy diff"}
            onClick={() => {
              void handleCopy();
            }}
            whileTap={reduce ? undefined : { scale: 0.9 }}
            transition={SPRING_PRESS}
            className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-background/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </motion.button>
        </div>
      ) : null}
    </div>
  );
}

/** Alias preferred by Atmos Agent Chat wiring. */
export const AgentFileDiffBody = FileDiffGift;
