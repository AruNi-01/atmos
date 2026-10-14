"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, TextShimmer } from "@workspace/ui";
import { CircleCheck, CircleDashed, ListTodo } from "lucide-react";
import type { AgentPlan } from "@/features/agent/lib/agent-chat-types";
import { ComposerCollapseGlyph } from "./composer-collapse-glyph";
import {
  agentChatPlanExpandKey,
  useAgentChatExpandStore,
} from "@/features/agent/store/agent-chat-expand-store";

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
    <span ref={textRef} className={className} onMouseEnter={startScroll} onMouseLeave={stopScroll}>
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
  expandKey,
}: {
  plan: AgentPlan;
  docked?: boolean;
  embedded?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  expandKey?: string;
}) {
  const t = useTranslations("Agent.components");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const storedOpen = useAgentChatExpandStore((state) =>
    expandKey ? state.values[agentChatPlanExpandKey(expandKey)] : undefined,
  );
  const setExpand = useAgentChatExpandStore((state) => state.setExpand);
  const isControlled = openControlled !== undefined;
  const isOpen = isControlled
    ? openControlled
    : expandKey
      ? (storedOpen ?? defaultOpen)
      : uncontrolledOpen;
  const setIsOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === "function" ? next(isOpen) : next;
      if (expandKey) setExpand(agentChatPlanExpandKey(expandKey), resolved);
      if (!isControlled && !expandKey) setUncontrolledOpen(resolved);
      onOpenChange?.(resolved);
    },
    [expandKey, isControlled, isOpen, onOpenChange, setExpand],
  );
  const planEntries = plan?.entries ?? [];
  const completedCount = planEntries.filter((e) => e.status === "completed").length;
  const totalCount = planEntries.length;
  const allCompleted = totalCount > 0 && completedCount === totalCount;
  const currentIndex = planEntries.findIndex(
    (e) => e.status === "in_progress" || e.status === "running",
  );
  const currentRunningEntry = currentIndex >= 0 ? planEntries[currentIndex] : undefined;
  const nextPendingIndex = planEntries.findIndex(
    (e) => e.status !== "completed" && e.status !== "in_progress" && e.status !== "running",
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
      className={`flex w-full flex-col overflow-hidden ${
        embedded
          ? ""
          : `border border-dashed border-border bg-background shadow-sm ${docked ? "rounded-t-xl rounded-b-none border-b-0" : "rounded-md"}`
      }`}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        {isOpen && (
          <CollapsibleTrigger asChild>
            <div className="group flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/10">
              <ComposerCollapseGlyph icon={ListTodo} />
              <span className="text-sm font-medium text-foreground/90">{t("plan.title")}</span>
              <div className="flex-1" />
              <span className="mr-1 text-sm text-muted-foreground">
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
              shouldScrollEntries ? "scrollbar-on-hover max-h-[216px] overflow-y-auto" : ""
            }`}
          >
            {planEntries.map((entry, idx) => {
              const isCompleted = entry.status === "completed";
              const isRunning = entry.status === "in_progress" || entry.status === "running";

              return (
                <div key={idx} className="flex items-center gap-2 px-3 py-1.5">
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {isCompleted ? (
                      <CircleCheck className="h-4 w-4 text-green-500" />
                    ) : isRunning ? (
                      <div className="relative flex items-center justify-center">
                        <CircleDashed className="h-4 w-4 animate-[spin_3s_linear_infinite] text-[#3b82f6]" />
                        <div className="absolute h-1.5 w-1.5 rounded-full bg-[#3b82f6]" />
                      </div>
                    ) : (
                      <CircleDashed className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>
                  <PlanEntryScrollableText
                    text={entry.content}
                    shimmer={isRunning}
                    className={`flex-1 overflow-hidden text-sm whitespace-nowrap ${
                      isCompleted
                        ? "text-muted-foreground/60 line-through"
                        : isRunning
                          ? "font-medium text-foreground"
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
              className={`group flex cursor-pointer items-center gap-2 overflow-hidden px-3 py-1.5 hover:bg-muted/10 ${embedded || docked ? "rounded-none" : "rounded-b-md bg-background"}`}
            >
              <ComposerCollapseGlyph icon={ListTodo} collapsed />
              <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                {allCompleted ? (
                  <CircleCheck className="h-4 w-4 text-green-500" />
                ) : currentRunningEntry ? (
                  <div className="relative flex items-center justify-center">
                    <CircleDashed className="h-4 w-4 animate-[spin_3s_linear_infinite] text-[#3b82f6]" />
                    <div className="absolute h-1.5 w-1.5 rounded-full bg-[#3b82f6]" />
                  </div>
                ) : (
                  <CircleDashed className="h-4 w-4 text-muted-foreground/40" />
                )}
              </div>
              <div className="relative flex h-5 flex-1 items-center overflow-hidden">
                <span className="mr-1 shrink-0 text-sm font-normal text-muted-foreground">
                  {collapsedLabel}
                </span>
                <div className="relative h-full flex-1 overflow-hidden">
                  <AnimatePresence mode="popLayout">
                    <motion.div
                      key={`${currentIndex}-${nextPendingIndex}-${isOpen ? "open" : "collapsed"}-${collapsedEntry.content}`}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -20, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className={`absolute inset-0 truncate text-sm ${
                        allCompleted
                          ? "font-normal text-muted-foreground/70 line-through"
                          : currentRunningEntry
                            ? "font-medium text-foreground"
                            : "font-normal text-muted-foreground/80"
                      }`}
                    >
                      {currentRunningEntry ? (
                        <TextShimmer
                          key={`${currentIndex}-${isOpen ? "open" : "collapsed"}-${collapsedEntry.content}`}
                          as="span"
                          className="inline"
                          duration={1.5}
                        >
                          {collapsedEntry.content}
                        </TextShimmer>
                      ) : (
                        collapsedEntry.content
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
              <span className="ml-2 shrink-0 text-sm text-muted-foreground">
                {collapsedCountLabel}
              </span>
            </div>
          </CollapsibleTrigger>
        )}
      </Collapsible>
    </div>
  );
}
