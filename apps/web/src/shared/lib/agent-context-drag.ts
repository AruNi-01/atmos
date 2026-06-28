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
}

export function hasAgentContextDragData(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(AGENT_CONTEXT_DRAG_MIME);
}

export function getAgentContextDragText(
  dataTransfer: DataTransfer,
): string | null {
  const raw = dataTransfer.getData(AGENT_CONTEXT_DRAG_MIME);
  if (!raw) return null;

  try {
    const payload = JSON.parse(raw) as Partial<AgentContextDragPayload>;
    if (payload.version !== 1 || !Array.isArray(payload.items)) {
      return null;
    }
    const text = payload.items
      .map((item) =>
        typeof item?.mentionText === "string" ? item.mentionText.trim() : "",
      )
      .filter(Boolean)
      .join(" ");
    return text || null;
  } catch {
    return null;
  }
}
