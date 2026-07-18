/**
 * Maps `atmos canvas <verb>` commands to human-facing labels for the agent
 * activity island. Pure functions — safe to unit test without tldraw.
 */
import { createTranslator } from "next-intl";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import { currentAppLocale } from "@/shared/lib/current-app-locale";

export type CanvasAgentFeedKind =
  | "read"
  | "create"
  | "edit"
  | "delete"
  | "move"
  | "layout"
  | "navigate"
  | "select";

export interface CanvasAgentCommandDescriptor {
  kind: CanvasAgentFeedKind;
  label: string;
}

let cachedCanvasAgentFeedLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedCanvasAgentFeedTranslator: any = null;

function canvasAgentFeedT(key: string, values?: Record<string, unknown>): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedCanvasAgentFeedTranslator || cachedCanvasAgentFeedLocale !== locale) {
    cachedCanvasAgentFeedLocale = locale;
    cachedCanvasAgentFeedTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "canvas.agentFeedLabels",
    });
  }
  return cachedCanvasAgentFeedTranslator(key as never, values);
}

/** Normalize CLI/WS verb aliases (`create_note` → `create-note`). */
export function normalizeCanvasAgentCommand(command: string): string {
  return command.trim().toLowerCase().replace(/_/g, "-");
}

function resolvePatchObject(
  args: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const raw = args?.patch;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore invalid JSON
    }
  }
  return null;
}

function patchTouchesText(args: Record<string, unknown> | null | undefined): boolean {
  const patch = resolvePatchObject(args);
  if (!patch) return false;
  return "text" in patch || "richText" in patch;
}

function hasCreateTextArg(args: Record<string, unknown> | null | undefined): boolean {
  const text = args?.text;
  return typeof text === "string" && text.length > 0;
}

function withCreateWriting(
  label: string,
  args: Record<string, unknown> | null | undefined,
): string {
  return hasCreateTextArg(args) ? canvasAgentFeedT("withWriting", { label }) : label;
}

export function describeCanvasAgentCommand(
  command: string,
  args?: Record<string, unknown> | null,
): CanvasAgentCommandDescriptor {
  const verb = normalizeCanvasAgentCommand(command);

  if (verb === "get-state" || verb === "status" || verb === "lint") {
    return { kind: "read", label: canvasAgentFeedT("readingCanvas") };
  }
  if (verb === "screenshot") {
    return { kind: "read", label: canvasAgentFeedT("capturingScreenshot") };
  }
  if (verb === "extract-text") {
    return { kind: "read", label: canvasAgentFeedT("extractingShapeText") };
  }

  if (verb === "create-note") {
    return {
      kind: "create",
      label: withCreateWriting(canvasAgentFeedT("creatingStickyNote"), args),
    };
  }
  if (verb === "create-frame") {
    return { kind: "create", label: canvasAgentFeedT("creatingFrame") };
  }
  if (verb === "create-geo") {
    const geo =
      typeof args?.geo === "string"
        ? args.geo
        : typeof args?.shape === "string"
          ? args.shape
          : typeof args?.kind === "string"
            ? args.kind
            : null;
    return {
      kind: "create",
      label: withCreateWriting(
        geo ? canvasAgentFeedT("creatingNamedShape", { shape: geo }) : canvasAgentFeedT("creatingShape"),
        args,
      ),
    };
  }
  if (verb === "create-arrow") {
    return {
      kind: "create",
      label: withCreateWriting(canvasAgentFeedT("creatingArrow"), args),
    };
  }
  if (verb === "create-draw") {
    return { kind: "create", label: canvasAgentFeedT("drawingStroke") };
  }

  if (verb === "update-shape") {
    const base = canvasAgentFeedT("editingShape");
    return {
      kind: "edit",
      label: patchTouchesText(args) ? canvasAgentFeedT("editingShapeAndWriting") : base,
    };
  }

  if (verb === "delete") {
    return { kind: "delete", label: canvasAgentFeedT("deletingShapes") };
  }
  if (verb === "move") {
    return { kind: "move", label: canvasAgentFeedT("movingShapes") };
  }

  if (
    verb === "layout-row" ||
    verb === "layout-column" ||
    verb === "layout-grid" ||
    verb === "align" ||
    verb === "stack" ||
    verb === "distribute" ||
    verb === "place"
  ) {
    return { kind: "layout", label: canvasAgentFeedT("arrangingLayout") };
  }

  if (verb === "apply") {
    return { kind: "edit", label: canvasAgentFeedT("applyingCanvasCommands") };
  }

  if (verb === "set-agent-view") {
    return { kind: "navigate", label: canvasAgentFeedT("settingAgentView") };
  }

  if (verb === "viewport") {
    return { kind: "navigate", label: canvasAgentFeedT("adjustingViewport") };
  }

  if (verb === "select" || verb === "clear-selection") {
    return {
      kind: "select",
      label: verb === "clear-selection" ? canvasAgentFeedT("clearingSelection") : canvasAgentFeedT("selectingShapes"),
    };
  }

  if (verb === "set-status") {
    const raw = args?.status;
    const status =
      typeof raw === "string" ? raw.trim().toLowerCase() : "idle";
    if (status === "active") {
      return { kind: "read", label: canvasAgentFeedT("canvasSessionActive") };
    }
    return { kind: "read", label: canvasAgentFeedT("finishedOnCanvas") };
  }

  return { kind: "edit", label: canvasAgentFeedT("workingOnCanvas") };
}
