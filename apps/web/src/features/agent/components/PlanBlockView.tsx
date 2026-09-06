"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  TextShimmer,
} from "@workspace/ui";
import { ChevronDown, CircleCheck, CircleDashed, ListTodo } from "lucide-react";
import type { AgentPlan } from "@/features/agent/lib/agent-chat-types";

function PlanEntryScrollableText({
  text,
  className,
  shimmer = false,
}: {
  text: string;
  className: string;
  shimmer?: boolean;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopScroll = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    const el = textRef.current;
    if (el) el.scrollLeft = 0;
  }, []);

  const startScroll = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow <= 0) return;

    el.scrollLeft = 0;
    timeoutRef.current = setTimeout(() => {
      const duration = overflow * 40;
      const startTime = performance.now();

      const step = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1);
        el.scrollLeft = overflow * progress;
        if (progress < 1) {
          animRef.current = requestAnimationFrame(step);
        }
      };
      animRef.current = requestAnimationFrame(step);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <span
      ref={textRef}
      className={className}
      onMouseEnter={startScroll}
      onMouseLeave={stopScroll}
    >
      {shimmer ? (
        <TextShimmer as="span" className="inline" duration={1.5}>
          {text}
        </TextShimmer>
      ) : (
        text
      )}
    </span>
  );
}

export function PlanBlockView({
  plan,
  docked = false,
  embedded = false,
  defaultOpen = true,
  open: openControlled,
  onOpenChange,
}: {
  plan: AgentPlan;
  docked?: boolean;
  embedded?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("Agent.components");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = openControlled !== undefined;
  const isOpen = isControlled ? openControlled : uncontrolledOpen;
  const setIsOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === "function" ? next(isOpen) : next;
      if (!isControlled) setUncontrolledOpen(resolved);
      onOpenChange?.(resolved);
    },
    [isControlled, isOpen, onOpenChange],
  );
  const planEntries = plan?.entries ?? [];
  const completedCount = planEntries.filter((e) => e.status === "completed").length;
  const totalCount = planEntries.length;
  const allCompleted = totalCount > 0 && completedCount === totalCount;
  const currentIndex = planEntries.findIndex(
    (e) => e.status === "in_progress" || e.status === "running"
  );
  const currentRunningEntry = currentIndex >= 0 ? planEntries[currentIndex] : undefined;
  const nextPendingIndex = planEntries.findIndex(
    (e) => e.status !== "completed" && e.status !== "in_progress" && e.status !== "running"
  );
  const collapsedEntry =
    currentRunningEntry ??
    (nextPendingIndex >= 0 ? planEntries[nextPendingIndex] : planEntries[planEntries.length - 1]);
  const collapsedLabel = currentRunningEntry
    ? t("plan.current")
    : allCompleted
      ? t("plan.completed")
      : t("plan.next");
  const collapsedCountLabel = allCompleted
    ? t("plan.allDone")
    : currentRunningEntry
      ? t("plan.remainingCount", { count: Math.max(totalCount - currentIndex, 0) })
      : t("plan.progressCount", { completed: completedCount, total: totalCount });
  const shouldScrollEntries = totalCount > 6;

  if (!plan || planEntries.length === 0) return null;

  return (
    <div
      className={`w-full flex-col bg-background flex overflow-hidden ${
        embedded
          ? ""
          : `border border-dashed border-border shadow-sm ${docked ? "rounded-t-xl rounded-b-none border-b-0" : "rounded-md"}`
      }`}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        {isOpen && (
          <CollapsibleTrigger asChild>
            <div className="group flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/10">
              <span className="relative inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground group-hover:text-foreground">
                <ListTodo
                  className="absolute size-4 transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-0 group-focus-visible:opacity-0"
                  aria-hidden
                />
                <ChevronDown
                  className="absolute size-4 opacity-0 transition-[opacity,transform] duration-150 motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden
                />
              </span>
              <span className="text-sm font-medium text-foreground/90">{t("plan.title")}</span>
              <div className="flex-1" />
              <span className="text-sm text-muted-foreground mr-1">
                {allCompleted
                  ? t("plan.allDone")
                  : t("plan.progressCount", { completed: completedCount, total: totalCount })}
              </span>
            </div>
          </CollapsibleTrigger>
        )}
        <CollapsibleContent>
          <div
            className={`flex flex-col ${
              shouldScrollEntries ? "max-h-[216px] overflow-y-auto scrollbar-on-hover" : ""
            }`}
          >
            {planEntries.map((entry, idx) => {
              const isCompleted = entry.status === "completed";
              const isRunning = entry.status === "in_progress" || entry.status === "running";

              return (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-1.5"
                >
                  <div className="shrink-0 flex items-center justify-center w-4 h-4">
                    {isCompleted ? (
                      <CircleCheck className="w-4 h-4 text-green-500" />
                    ) : isRunning ? (
                      <div className="relative flex items-center justify-center">
                        <CircleDashed className="w-4 h-4 text-[#3b82f6] animate-[spin_3s_linear_infinite]" />
                        <div className="absolute w-1.5 h-1.5 bg-[#3b82f6] rounded-full" />
                      </div>
                    ) : (
                      <CircleDashed className="w-4 h-4 text-muted-foreground/40" />
                    )}
                  </div>
                  <PlanEntryScrollableText
                    text={entry.content}
                    shimmer={isRunning}
                    className={`text-sm flex-1 overflow-hidden whitespace-nowrap ${isCompleted
                      ? "line-through text-muted-foreground/60"
                      : isRunning
                        ? "text-foreground font-medium"
                        : "text-muted-foreground/80"
                      }`}
                  />
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
        {!isOpen && collapsedEntry && (
          <CollapsibleTrigger asChild>
            <div
              className={`group flex cursor-pointer items-center gap-2 overflow-hidden bg-background px-3 py-1.5 hover:bg-muted/10 ${embedded || docked ? "rounded-none" : "rounded-b-md"}`}
            >
              <span className="relative inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground group-hover:text-foreground">
                <ListTodo
                  className="absolute size-4 transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-0 group-focus-visible:opacity-0"
                  aria-hidden
                />
                <ChevronDown
                  className="absolute size-4 -rotate-90 opacity-0 transition-[opacity,transform] duration-150 motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden
                />
              </span>
              <div className="shrink-0 flex items-center justify-center w-4 h-4">
                {allCompleted ? (
                  <CircleCheck className="w-4 h-4 text-green-500" />
                ) : currentRunningEntry ? (
                  <div className="relative flex items-center justify-center">
                    <CircleDashed className="w-4 h-4 text-[#3b82f6] animate-[spin_3s_linear_infinite]" />
                    <div className="absolute w-1.5 h-1.5 bg-[#3b82f6] rounded-full" />
                  </div>
                ) : (
                  <CircleDashed className="w-4 h-4 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex flex-1 items-center h-5 relative overflow-hidden">
                <span className="text-sm text-muted-foreground mr-1 font-normal shrink-0">{collapsedLabel}</span>
                <div className="flex-1 relative h-full overflow-hidden">
                  <AnimatePresence mode="popLayout">
                    <motion.div
                      key={`${currentIndex}-${nextPendingIndex}-${isOpen ? "open" : "collapsed"}-${collapsedEntry.content}`}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -20, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className={`absolute inset-0 text-sm truncate ${
                        allCompleted
                          ? "font-normal line-through text-muted-foreground/70"
                          : currentRunningEntry
                            ? "font-medium text-foreground"
                            : "font-normal text-muted-foreground/80"
                      }`}
                    >
                      {currentRunningEntry ? (
                        <TextShimmer key={`${currentIndex}-${isOpen ? "open" : "collapsed"}-${collapsedEntry.content}`} as="span" className="inline" duration={1.5}>
                          {collapsedEntry.content}
                        </TextShimmer>
                      ) : (
                        collapsedEntry.content
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
              <span className="text-sm text-muted-foreground ml-2 shrink-0">
                {collapsedCountLabel}
              </span>
            </div>
          </CollapsibleTrigger>
        )}
      </Collapsible>

    </div>
  );
}
