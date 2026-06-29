"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useEditor, useValue, type TLShapeId } from "tldraw";
import { Bot, Check, Copy, Crosshair } from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  cn,
  toastManager,
} from "@workspace/ui";

import type { CanvasAgentBridgeState } from "../hooks/use-canvas-agent-bridge";
import {
  type CanvasAgentActivity,
  type CanvasAgentActivityStore,
  type CanvasAgentViewState,
  resolveCanvasAgentIndicatorActive,
} from "../lib/canvas-agent-activity";

const SKILL_PATH = "~/.atmos/skills/.system/atmos-canvas-agent/SKILL.md";

/** Window after activity within which the bridge is rendered as "Active". */
const ACTIVE_WINDOW_MS = 30_000;
/** How long the transient ring around just-touched shapes stays visible. */
const RING_DURATION_MS = 1_500;

/**
 * Renders a soft pulsing ring around the shapes the agent most recently
 * created or modified. Mounted inside <Tldraw> so it can use `useEditor()`
 * to translate page-space shape bounds into the container-local viewport
 * coordinates used for absolute positioning.
 *
 * Deliberately anonymous: no agent name, no per-agent colour. The only
 * question the user needs answered is "did *I* do that?". A transient ring
 * answers it without any identity baggage.
 */
export function CanvasAgentOverlay({
  bridge,
}: {
  bridge: CanvasAgentBridgeState;
}) {
  const editor = useEditor();
  const activity = useActivity(bridge.activity);
  const ringVisible = useTimeWindow(activity?.at ?? null, RING_DURATION_MS);

  if (!ringVisible || !activity || activity.shapeIds.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[2]">
      {activity.shapeIds.map((shapeId) => (
        <ShapeRing key={`${shapeId}:${activity.at}`} shapeId={shapeId} editor={editor} />
      ))}
    </div>
  );
}

function ShapeRing({
  shapeId,
  editor,
}: {
  shapeId: string;
  editor: ReturnType<typeof useEditor>;
}) {
  // Subscribe to camera so the ring tracks pan/zoom. The value itself is
  // unused — we only need the subscription to trigger re-renders below.
  useValue(
    "canvas-agent.ring-camera",
    () => {
      const c = editor.getCamera();
      return `${c.x}|${c.y}|${c.z}`;
    },
    [editor],
  );

  let bounds: ReturnType<typeof editor.getShapePageBounds> | null = null;
  try {
    bounds = editor.getShapePageBounds(shapeId as TLShapeId) ?? null;
  } catch {
    bounds = null;
  }
  if (!bounds) return null;

  let topLeft: { x: number; y: number };
  let bottomRight: { x: number; y: number };
  try {
    topLeft = editor.pageToViewport({ x: bounds.minX, y: bounds.minY });
    bottomRight = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY });
  } catch {
    return null;
  }

  const width = Math.max(0, bottomRight.x - topLeft.x);
  const height = Math.max(0, bottomRight.y - topLeft.y);

  return (
    <div
      style={{
        left: topLeft.x - 4,
        top: topLeft.y - 4,
        width: width + 8,
        height: height + 8,
      }}
      className={cn(
        "absolute rounded-lg border border-emerald-400/80",
        "shadow-[0_0_0_2px_rgba(52,211,153,0.16),0_0_12px_2px_rgba(52,211,153,0.28)]",
        "animate-[canvas-agent-ring_1500ms_ease-out_forwards]",
      )}
    />
  );
}

/**
 * SharePanel cluster: one status-aware Bot button that opens a popover with
 * the enable toggle, the instruction snippet (visible + copy), and a
 * 包含最近活动与跳转动作的摘要行。
 *
 * `onJump` is injected from the parent (CanvasView) rather than read via
 * `useEditor()` here: this component is rendered through tldraw's SharePanel
 * slot, where the editor context is not guaranteed to be available across
 * tldraw versions, and a thrown `useEditor()` would silently break the
 * trigger button.
 */
export function CanvasAgentBridgeControls({
  bridge,
  iconButtonClass,
  onJump,
}: {
  bridge: CanvasAgentBridgeState;
  iconButtonClass: string;
  onJump: () => void;
}) {
  const t = useTranslations("canvas.agentBridge");
  const [open, setOpen] = React.useState(false);
  const activity = useActivity(bridge.activity);
  const viewState = useAgentViewState(bridge.activity);
  const recentlyActive = useTimeWindow(activity?.at ?? null, ACTIVE_WINDOW_MS);
  const isActive = resolveCanvasAgentIndicatorActive(viewState, recentlyActive);

  const status: "off" | "idle" | "active" = !bridge.acceptsCommands
    ? "off"
    : isActive
      ? "active"
      : "idle";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/*
        Render PopoverTrigger as its own <button> rather than wrapping a Button
        with `asChild`. Slot composition + the project's Button + tldraw's
        SharePanel host has been observed to silently swallow the toggle
        click; a plain trigger sidesteps the entire problem.
      */}
      <PopoverTrigger
        type="button"
        aria-label={t("trigger.aria")}
        title={t("trigger.title")}
        className={cn(
          "relative inline-flex items-center justify-center",
          iconButtonClass,
          bridge.acceptsCommands && "bg-foreground/10 text-foreground",
        )}
      >
        <Bot
          className={cn(
            "size-3.5 transition-colors",
            status === "off" ? "text-muted-foreground" : "text-foreground",
          )}
        />
        <StatusDot status={status} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="z-[200] w-[320px] p-0"
      >
        <BridgePopoverBody
          bridge={bridge}
          activity={activity}
          status={status}
          onJump={onJump}
        />
      </PopoverContent>
    </Popover>
  );
}

function StatusDot({ status }: { status: "off" | "idle" | "active" }) {
  if (status === "off") return null;
  return (
    <span className="pointer-events-none absolute right-1 top-1 flex size-1.5">
      {status === "active" && (
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
      )}
      <span
        className={cn(
          "relative inline-flex size-1.5 rounded-full",
          status === "active" ? "bg-emerald-500" : "bg-muted-foreground/60",
        )}
      />
    </span>
  );
}

function BridgePopoverBody({
  bridge,
  activity,
  status,
  onJump,
}: {
  bridge: CanvasAgentBridgeState;
  activity: CanvasAgentActivity | null;
  status: "off" | "idle" | "active";
  onJump: () => void;
}) {
  const t = useTranslations("canvas.agentBridge");
  const [isCopied, setIsCopied] = React.useState(false);
  const instructionBlurb = buildCanvasAgentInstructionBlurb(t);

  React.useEffect(() => {
    if (!isCopied) return;
    const timeout = window.setTimeout(() => {
      setIsCopied(false);
    }, 2_000);
    return () => window.clearTimeout(timeout);
  }, [isCopied]);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(instructionBlurb);
      setIsCopied(true);
      toastManager.add({
        title: t("toast.title"),
        description: t("toast.copied"),
        type: "success",
      });
    } catch (err) {
      toastManager.add({
        title: t("toast.title"),
        description:
          err instanceof Error
            ? t("toast.copyFailedWithMessage", { message: err.message })
            : t("toast.copyFailed"),
        type: "error",
      });
    }
  }, [instructionBlurb, t]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="text-sm font-semibold">{t("title")}</div>
        <StatusPill status={status} />
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{t("enable.title")}</div>
          <div className="text-xs text-muted-foreground">
            {t("enable.descriptionPrefix")}{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">atmos canvas</code>{" "}
            {t("enable.descriptionSuffix")}
          </div>
        </div>
        <Switch
          checked={bridge.acceptsCommands}
          onCheckedChange={(value) => bridge.setAcceptsCommands(Boolean(value))}
          aria-label={t("enable.aria")}
        />
      </div>

      <div className="px-4 py-3">
        <div className="mb-3 border-t border-border" />
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-muted-foreground">
            {t("snippet.label")}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleCopy()}
            className="h-6 gap-1 px-2 text-[11px]"
          >
            {isCopied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
            {isCopied ? t("snippet.copied") : t("snippet.copy")}
          </Button>
        </div>
        <pre className="max-h-44 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono text-muted-foreground">
          {instructionBlurb}
        </pre>
      </div>

      <div className="px-4 py-3">
        <div className="mb-3 border-t border-border" />
        <LastActivityRow activity={activity} onJump={onJump} />
      </div>
    </div>
  );
}

function LastActivityRow({
  activity,
  onJump,
}: {
  activity: CanvasAgentActivity | null;
  onJump: () => void;
}) {
  const t = useTranslations("canvas.agentBridge");
  const tr = React.useCallback(
    (key: string, values?: Record<string, string | number>) =>
      t(key as never, values as never),
    [t],
  );
  const lastChangeLabel = tr("activity.lastChange");
  const jumpLabel = tr("activity.jump");
  const emptyPrefix = tr("activity.emptyPrefix");
  const emptySuffix = tr("activity.emptySuffix");
  const separator = React.useCallback(
    (label: string) => tr("activity.separator", { relativeLabel: label }),
    [tr],
  );
  // Refresh the "Xs ago" label every 1s only while we have something to show.
  // Owned by an effect (not derived in render) so render stays pure.
  const [relativeLabel, setRelativeLabel] = React.useState("");
  React.useEffect(() => {
    if (!activity) {
      setRelativeLabel("");
      return;
    }
    setRelativeLabel(formatRelativeTime(activity.at, tr));
    const intervalId = setInterval(() => {
      setRelativeLabel(formatRelativeTime(activity.at, tr));
    }, 1_000);
    return () => clearInterval(intervalId);
  }, [activity, tr]);

  if (!activity) {
    return (
      <div className="text-xs text-muted-foreground">
        {emptyPrefix}{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">atmos canvas</code>{" "}
        {emptySuffix}
      </div>
    );
  }

  const canJump = activity.bounds !== null || activity.shapeIds.length > 0;

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0 text-xs">
        <div className="text-muted-foreground">{lastChangeLabel}</div>
        <div className="truncate font-mono text-[11px] text-foreground">
          {activity.command}
          <span className="text-muted-foreground">{separator(relativeLabel)}</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onJump}
        disabled={!canJump}
        className="h-7 gap-1 px-2 text-[11px]"
      >
        <Crosshair className="size-3" />
        {jumpLabel}
      </Button>
    </div>
  );
}

function StatusPill({ status }: { status: "off" | "idle" | "active" }) {
  const t = useTranslations("canvas.agentBridge");
  const label = status === "off" ? t("status.off") : status === "active" ? t("status.active") : t("status.listening");
  const tone =
    status === "off"
      ? "bg-muted text-muted-foreground"
      : status === "active"
        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        tone,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "off"
            ? "bg-muted-foreground/40"
            : status === "active"
              ? "bg-emerald-500"
              : "bg-muted-foreground/70",
        )}
      />
      {label}
    </span>
  );
}

function formatRelativeTime(
  at: number,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1_000));
  if (seconds < 60) {
    return t("relative.seconds", { count: seconds });
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return t("relative.minutes", { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  return t("relative.hours", { count: hours });
}

function useActivity(store: CanvasAgentActivityStore): CanvasAgentActivity | null {
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

function useAgentViewState(store: CanvasAgentActivityStore): CanvasAgentViewState {
  return React.useSyncExternalStore(store.subscribe, store.getViewState, store.getViewState);
}

/**
 * Returns `true` while we're still inside `windowMs` of `at`. State is owned
 * by an effect (not derived in render) to keep render pure; the effect
 * schedules a single timeout to flip back to `false`, so no polling.
 */
function useTimeWindow(at: number | null, windowMs: number): boolean {
  const [active, setActive] = React.useState(false);
  React.useEffect(() => {
    if (at === null) {
      setActive(false);
      return;
    }
    const remaining = at + windowMs - Date.now();
    if (remaining <= 0) {
      setActive(false);
      return;
    }
    setActive(true);
    const t = setTimeout(() => setActive(false), remaining);
    return () => clearTimeout(t);
  }, [at, windowMs]);
  return active;
}

// Re-exported for tests / callers who want to embed the blurb elsewhere.
export const CANVAS_AGENT_SKILL_PATH = SKILL_PATH;

export function buildCanvasAgentInstructionBlurb(
  t: ReturnType<typeof useTranslations>,
): string {
  return t("instructionBlurb", { skillPath: SKILL_PATH });
}
