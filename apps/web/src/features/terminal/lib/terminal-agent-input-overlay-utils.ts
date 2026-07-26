import { agentApi as agentRestApi } from "@/api/rest-api";
import { formatAppshotPrompt } from "@/features/appshot/lib/appshot-protocol";
import { materializeAiContextText } from "@/shared/lib/ai-context-protocol";

export type TerminalAgentPromptAttachment = {
  number: number;
  objectUrl: string;
  filename: string;
  blob: Blob;
};

export type TerminalAgentFlyingMessage = {
  id: number;
  text: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

const POPOVER_WIDTH = 460;
const POPOVER_GAP = 8;
const VIEWPORT_MARGIN = 8;

export function getTerminalAgentPopoverAboveCaret(caretRect: DOMRect) {
  const viewportWidth = typeof window === "undefined" ? POPOVER_WIDTH : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight;
  return {
    bottom: Math.max(VIEWPORT_MARGIN, viewportHeight - caretRect.top + POPOVER_GAP),
    left: Math.min(
      Math.max(VIEWPORT_MARGIN, caretRect.left),
      Math.max(VIEWPORT_MARGIN, viewportWidth - POPOVER_WIDTH - VIEWPORT_MARGIN),
    ),
  };
}

export async function resolveTerminalAgentPrompt({
  attachments,
  localPath,
  text,
}: {
  attachments: TerminalAgentPromptAttachment[];
  localPath?: string | null;
  text: string;
}) {
  let attachmentPathByNumber = new Map<number, string>();

  if (attachments.length > 0 && localPath) {
    const { paths } = await agentRestApi.uploadAttachments(
      localPath,
      attachments.map((attachment) => ({
        url: attachment.objectUrl,
        filename: attachment.filename,
        mediaType: attachment.blob.type || "application/octet-stream",
      })),
    );
    attachmentPathByNumber = new Map(
      attachments.map((attachment, index) => [
        attachment.number,
        paths[index] ?? `.atmos/attachments/${attachment.filename}`,
      ]),
    );
  }

  return materializeAiContextText(
    text
      .replace(/@(?:issue|pr)#\d+/g, () => ".atmos/context/requirement.md")
      .replace(/@file:([^\s]+)/g, (_match, relativePath: string) => `@${relativePath}`)
      .replace(/\[#appshot:(\d{13})\]/g, (_match, timestamp: string) =>
        formatAppshotPrompt(timestamp),
      )
      .replace(/\[#img-(\d+)\]/g, (match, number: string) => {
        const path = attachmentPathByNumber.get(Number(number));
        return path ? `@${path}` : match;
      }),
  );
}

export function buildTerminalAgentFlyingMessage({
  id,
  messageText,
  shell,
  target,
}: {
  id: number;
  messageText: string;
  shell: HTMLElement | null;
  target?: { x: number; y: number } | null;
}): TerminalAgentFlyingMessage | null {
  const shellRect = shell?.getBoundingClientRect();
  if (!shellRect || !target) return null;

  const trimmed = messageText.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;

  return {
    id,
    text: trimmed.length > 90 ? `${trimmed.slice(0, 87)}...` : trimmed,
    from: {
      x: shellRect.left + shellRect.width / 2,
      y: shellRect.top + shellRect.height / 2,
    },
    to: target,
  };
}
