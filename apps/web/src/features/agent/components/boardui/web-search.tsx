"use client";

import { useEffect, useId, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/shared/lib/utils";
import {
  GuideBridge,
  LogRow,
  SOFT_EASE,
  ShimmerText,
  useLogMotion,
} from "./agent-log";

/**
 * Web search trail adapted from BoardUI Web Search.
 * Site marks use the caller's glyph (our favicons) instead of the
 * built-in brand set. Expand labels stay with the caller.
 */

export interface WebSearchSource {
  title: string;
  domain: string;
  href?: string;
  icon?: ReactNode;
}

export interface WebSearchStep {
  label: string;
  query?: string;
  icon?: ComponentType<{ className?: string }>;
  meta?: string;
  sources?: WebSearchSource[];
}

const SOURCES_BRIDGE = 5;
const SOURCES_INDENT = 7;
const STACK_LIMIT = 6;
const ROW_STAGGER = 100;
const ROW_LEAD = 100;
const ROW_CLOSE = 100;
const TEXT_DELAY = 0.05;
const TEXT_FADE = 0.16;
const FLIGHT_TRANSITION = { type: "spring" as const, stiffness: 420, damping: 36 };
const STACK_LAG = 0.07;

function StepGlyph({ step }: { step: WebSearchStep }) {
  const Icon = step.icon;
  if (!Icon) return <span aria-hidden className="mt-0.5 size-4 shrink-0" />;
  return <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
}

function SourceMark({
  source,
  layoutId,
  z,
}: {
  source: WebSearchSource;
  layoutId?: string;
  z: number;
}) {
  return (
    <motion.span
      layoutId={layoutId}
      transition={FLIGHT_TRANSITION}
      style={{ zIndex: z }}
      className="relative flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background"
    >
      {source.icon ? (
        <span aria-hidden className="flex size-3 items-center justify-center">
          {source.icon}
        </span>
      ) : (
        <span aria-hidden className="size-2 rounded-full bg-muted-foreground/30" />
      )}
    </motion.span>
  );
}

function SourceLinkRow({
  source,
  visible,
  layoutId,
  z,
  skip,
}: {
  source: WebSearchSource;
  visible: boolean;
  layoutId?: string;
  z: number;
  skip: boolean;
}) {
  const Row = source.href ? "a" : "div";
  return (
    <motion.li
      initial={false}
      animate={{ height: visible ? "auto" : 0 }}
      transition={{ duration: skip ? 0 : 0.28, ease: SOFT_EASE }}
      className="overflow-hidden"
    >
      <Row
        {...(source.href ? { href: source.href, target: "_blank", rel: "noreferrer" } : {})}
        className={cn(
          "flex items-center gap-2 rounded-md px-1 py-1",
          source.href && "cursor-pointer transition-colors duration-150 ease-out hover:bg-muted/60",
        )}
      >
        {visible ? (
          <SourceMark source={source} layoutId={layoutId} z={z} />
        ) : (
          <span aria-hidden className="size-5 shrink-0" />
        )}
        <motion.span
          initial={false}
          animate={{ opacity: visible ? 1 : 0 }}
          transition={{ duration: TEXT_FADE, delay: visible && !skip ? TEXT_DELAY : 0 }}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-muted-foreground">
            {source.title}
          </span>
          <span className="hidden shrink-0 text-xs text-muted-foreground/80 sm:block">
            {source.domain}
          </span>
        </motion.span>
      </Row>
    </motion.li>
  );
}

function SourcesRow({
  sources,
  sourcesLabel,
  layoutKey,
  skip,
}: {
  sources: WebSearchSource[];
  sourcesLabel: string;
  layoutKey: string;
  skip: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(0);
  const total = sources.length;

  useEffect(() => {
    if (open && shown >= total) return;
    if (!open && shown === 0) return;
    const delay = open ? (shown === 0 ? ROW_LEAD : ROW_STAGGER) : ROW_CLOSE;
    const id = window.setTimeout(
      () => setShown((n) => (open ? n + 1 : n - 1)),
      skip ? 0 : delay,
    );
    return () => window.clearTimeout(id);
  }, [open, shown, total, skip]);

  const stacked = sources.slice(0, STACK_LIMIT);
  const overflow = total - stacked.length;
  const rowVisible = (index: number) => shown > total - 1 - index;
  const flightId = (index: number) =>
    skip || index >= STACK_LIMIT ? undefined : `${layoutKey}-source-${index}`;
  const stillStacked = stacked.filter((_, index) => !rowVisible(index)).length;
  const stackWidth = stillStacked > 0 ? stillStacked * 14 + 6 : 0;

  return (
    <LogRow first={false} last instant={skip}>
      <div className="py-1">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="group flex cursor-pointer items-center rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="shrink-0 text-[13px] leading-5 text-muted-foreground">{sourcesLabel}</span>
          <motion.span
            data-websearch-stack=""
            className="ms-2 flex shrink-0 items-center"
            initial={false}
            animate={{ width: stackWidth }}
            transition={skip ? { duration: 0 } : { ...FLIGHT_TRANSITION, delay: STACK_LAG }}
          >
            <span className="flex items-center -space-x-1.5">
              {stacked.map((source, index) =>
                rowVisible(index) ? null : (
                  <SourceMark
                    key={`${source.domain}-${index}`}
                    source={source}
                    layoutId={flightId(index)}
                    z={stacked.length - index}
                  />
                ),
              )}
            </span>
          </motion.span>
          {overflow > 0 && shown === 0 ? (
            <span className="ms-2 shrink-0 text-[13px] leading-5 text-muted-foreground/80 tabular-nums">
              +{overflow}
            </span>
          ) : null}
          <ChevronDown
            aria-hidden
            className={cn(
              "ms-1 size-4 shrink-0 text-muted-foreground/60 transition-transform duration-300 ease-out group-hover:text-muted-foreground",
              open ? "rotate-180" : "rotate-0",
            )}
          />
        </button>
        <ul data-websearch-list="" className="flex list-none flex-col p-0">
          {sources.map((source, index) => (
            <SourceLinkRow
              key={`${source.domain}-${index}`}
              source={source}
              visible={rowVisible(index)}
              layoutId={flightId(index)}
              z={total - index}
              skip={skip}
            />
          ))}
        </ul>
      </div>
    </LogRow>
  );
}

function StepContent({ step, active }: { step: WebSearchStep; active: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <StepGlyph step={step} />
      <p className="min-w-0 flex-1 text-[13px] leading-5 text-muted-foreground">
        {active ? <ShimmerText>{step.label}</ShimmerText> : step.label}
        {step.query ? (
          <span className="ms-1.5 font-mono text-xs text-muted-foreground/80">
            {step.query}
          </span>
        ) : null}
      </p>
      {step.meta ? (
        <span className="shrink-0 pt-px text-[13px] leading-5 text-muted-foreground/80 tabular-nums">
          {step.meta}
        </span>
      ) : null}
    </div>
  );
}

export function WebSearch({
  steps,
  sourcesLabel,
  active = false,
  instant = false,
  className,
}: {
  steps: WebSearchStep[];
  sourcesLabel: string;
  /** Shimmer the newest step while the tool is still running. */
  active?: boolean;
  instant?: boolean;
  className?: string;
}) {
  const reduce = useLogMotion();
  const skip = reduce || instant;
  const uid = useId();
  const last = steps.length - 1;

  return (
    <div className={cn("w-full", className)}>
      <ul aria-live="polite" className="flex list-none flex-col p-0">
        {steps.map((step, index) => {
          const sources = step.sources ?? [];
          const showStep = step.label.trim().length > 0 || Boolean(step.query) || Boolean(step.meta);
          if (!showStep) {
            if (sources.length === 0) return null;
            return (
              <SourcesRow
                key={`sources-${index}`}
                sources={sources}
                sourcesLabel={sourcesLabel}
                layoutKey={`${uid}-${index}`}
                skip={skip}
              />
            );
          }
          return (
            <LogRow
              key={`${step.label}-${index}`}
              first={index === 0}
              last={index === last}
              instant={skip}
              className="ps-[14px]"
            >
              <div className="py-1">
                <StepContent step={step} active={active && index === last} />
                {sources.length ? (
                  <div className="relative mt-0.5">
                    <GuideBridge height={SOURCES_BRIDGE} offset={SOURCES_INDENT} skip={skip} />
                    <ul
                      className="flex list-none flex-col p-0"
                      style={{ marginInlineStart: SOURCES_INDENT }}
                    >
                      <SourcesRow
                        sources={sources}
                        sourcesLabel={sourcesLabel}
                        layoutKey={`${uid}-${index}`}
                        skip={skip}
                      />
                    </ul>
                  </div>
                ) : null}
              </div>
            </LogRow>
          );
        })}
      </ul>
    </div>
  );
}
