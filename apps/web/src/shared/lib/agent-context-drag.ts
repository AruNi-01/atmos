import { tryRelativePathUnderRoot } from "@/shared/lib/path-under-root";

const AGENT_CONTEXT_DRAG_MIME = "application/x-atmos-agent-context";

type AgentContextDragKind = "file" | "directory";

export interface AgentContextDragItem {
  kind: AgentContextDragKind;
  path: string;
  mentionText: string;
}

interface AgentContextDragPayload {
  version: 1;
  items: AgentContextDragItem[];
}

export function getAgentContextMentionPath(
  path: string,
  rootPath?: string | null,
): string {
  const trimmed = path.trim();
  if (!trimmed) return "";
  if (!rootPath) return trimmed;
  const relativePath = tryRelativePathUnderRoot(trimmed, rootPath);
  if (relativePath == null) return trimmed;
  return relativePath || ".";
}

export function formatAgentContextMention(path: string): string {
  return `@${path}`;
}

function getDragPreviewLabel(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized.split("/").pop() || normalized || path;
}

function setAgentContextDragPreview(
  dataTransfer: DataTransfer,
  item: {
    kind: AgentContextDragKind;
    path: string;
  },
) {
  if (typeof document === "undefined" || typeof dataTransfer.setDragImage !== "function") {
    return;
  }

  const preview = document.createElement("div");
  const badge = document.createElement("span");
  const label = document.createElement("span");

  preview.style.cssText = [
    "position:fixed",
    "top:-1000px",
    "left:-1000px",
    "z-index:2147483647",
    "display:inline-flex",
    "align-items:center",
    "gap:8px",
    "max-width:260px",
    "height:28px",
    "padding:0 10px",
    "border:1px solid color-mix(in srgb, var(--border) 78%, transparent)",
    "border-radius:8px",
    "background:color-mix(in srgb, var(--background) 94%, var(--muted))",
    "color:var(--foreground)",
    "box-shadow:0 8px 24px rgba(0,0,0,0.22)",
    "font:500 12px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "pointer-events:none",
  ].join(";");
  badge.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "width:16px",
    "height:16px",
    "border-radius:5px",
    "background:color-mix(in srgb, var(--foreground) 12%, transparent)",
    "color:var(--muted-foreground)",
    "font-size:10px",
    "line-height:16px",
    "text-transform:uppercase",
    "flex:0 0 auto",
  ].join(";");
  label.style.cssText = [
    "display:block",
    "min-width:0",
    "max-width:210px",
    "overflow:hidden",
    "white-space:nowrap",
    "text-overflow:ellipsis",
  ].join(";");

  badge.textContent = item.kind === "directory" ? "D" : "F";
  label.textContent = getDragPreviewLabel(item.path);
  preview.append(badge, label);
  document.body.appendChild(preview);
  dataTransfer.setDragImage(preview, 14, 14);
  window.requestAnimationFrame(() => {
    preview.remove();
  });
}

export function setAgentContextDragData(
  dataTransfer: DataTransfer,
  item: {
    kind: AgentContextDragKind;
    path: string;
  },
) {
  const path = item.path.trim();
  if (!path) return;

  const payload: AgentContextDragPayload = {
    version: 1,
    items: [
      {
        kind: item.kind,
        path,
        mentionText: formatAgentContextMention(path),
      },
    ],
  };

  const text = payload.items.map((entry) => entry.mentionText).join(" ");
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(AGENT_CONTEXT_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.setData("text/plain", text);
  setAgentContextDragPreview(dataTransfer, item);
}

export function hasAgentContextDragData(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(AGENT_CONTEXT_DRAG_MIME);
}

export function getAgentContextDragItems(
  dataTransfer: DataTransfer,
): AgentContextDragItem[] | null {
  const raw = dataTransfer.getData(AGENT_CONTEXT_DRAG_MIME);
  if (!raw) return null;

  try {
    const payload = JSON.parse(raw) as Partial<AgentContextDragPayload>;
    if (payload.version !== 1 || !Array.isArray(payload.items)) {
      return null;
    }
    const items = payload.items
      .map((item) => {
        if (
          (item?.kind !== "file" && item?.kind !== "directory") ||
          typeof item.path !== "string" ||
          typeof item.mentionText !== "string"
        ) {
          return null;
        }
        const path = item.path.trim();
        const mentionText = item.mentionText.trim();
        if (!path || !mentionText) return null;
        return { kind: item.kind, path, mentionText };
      })
      .filter((item): item is AgentContextDragItem => item !== null);
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

export function getAgentContextDragText(
  dataTransfer: DataTransfer,
): string | null {
  const items = getAgentContextDragItems(dataTransfer);
  if (!items) return null;

  const text = items
      .map((item) =>
        typeof item?.mentionText === "string" ? item.mentionText.trim() : "",
      )
      .filter(Boolean)
      .join(" ");
  return text || null;
}
