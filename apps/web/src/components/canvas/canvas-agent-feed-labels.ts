/**
 * Maps `atmos canvas <verb>` commands to human-facing labels for the agent
 * activity island. Pure functions — safe to unit test without tldraw.
 */

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

function normalizeCommand(command: string): string {
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
  return hasCreateTextArg(args) ? `${label} and writing` : label;
}

export function describeCanvasAgentCommand(
  command: string,
  args?: Record<string, unknown> | null,
): CanvasAgentCommandDescriptor {
  const verb = normalizeCommand(command);

  if (verb === "get-state" || verb === "status" || verb === "lint") {
    return { kind: "read", label: "Reading canvas" };
  }
  if (verb === "extract-text") {
    return { kind: "read", label: "Extracting shape text" };
  }

  if (verb === "create-note") {
    return {
      kind: "create",
      label: withCreateWriting("Creating sticky note", args),
    };
  }
  if (verb === "create-frame") {
    return { kind: "create", label: "Creating frame" };
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
      label: withCreateWriting(geo ? `Creating ${geo}` : "Creating shape", args),
    };
  }
  if (verb === "create-arrow") {
    return {
      kind: "create",
      label: withCreateWriting("Creating arrow", args),
    };
  }
  if (verb === "create-draw") {
    return { kind: "create", label: "Drawing stroke" };
  }

  if (verb === "update-shape") {
    const base = "Editing shape";
    return {
      kind: "edit",
      label: patchTouchesText(args) ? `${base} and writing` : base,
    };
  }

  if (verb === "delete") {
    return { kind: "delete", label: "Deleting shapes" };
  }
  if (verb === "move") {
    return { kind: "move", label: "Moving shapes" };
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
    return { kind: "layout", label: "Arranging layout" };
  }

  if (verb === "apply") {
    return { kind: "edit", label: "Applying canvas commands" };
  }

  if (verb === "set-agent-view") {
    return { kind: "navigate", label: "Setting agent view" };
  }

  if (verb === "viewport") {
    return { kind: "navigate", label: "Adjusting viewport" };
  }

  if (verb === "select" || verb === "clear-selection") {
    return {
      kind: "select",
      label: verb === "clear-selection" ? "Clearing selection" : "Selecting shapes",
    };
  }

  if (verb === "set-status") {
    const raw = args?.status;
    const status =
      typeof raw === "string" ? raw.trim().toLowerCase() : "idle";
    if (status === "active") {
      return { kind: "read", label: "Canvas session active" };
    }
    return { kind: "read", label: "Finished on canvas" };
  }

  return { kind: "edit", label: "Working on canvas" };
}
