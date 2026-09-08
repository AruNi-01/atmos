export type ComposerFlyKind = "conversation" | "queue";

export type ComposerFlyingMessage = {
  id: number;
  text: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

function centerOf(rect: DOMRect): { x: number; y: number } {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function composerShellOrigin(): { x: number; y: number } | null {
  const shell = document.querySelector<HTMLElement>("[data-agent-chat-composer] form");
  const fallback = document.querySelector<HTMLElement>("[data-agent-chat-composer]");
  const rect = (shell ?? fallback)?.getBoundingClientRect();
  return rect ? centerOf(rect) : null;
}

export function composerFlyTarget(kind: ComposerFlyKind): { x: number; y: number } | null {
  if (kind === "queue") {
    const dock = document.querySelector<HTMLElement>("[data-agent-message-queue]");
    if (dock) {
      const rect = dock.getBoundingClientRect();
      return { x: rect.left + Math.min(88, rect.width / 2), y: rect.top + rect.height / 2 };
    }
    const cards = document.querySelector<HTMLElement>("[data-agent-composer-upper-cards]");
    const composer = document.querySelector<HTMLElement>("[data-agent-chat-composer]");
    const rect = (cards ?? composer)?.getBoundingClientRect();
    if (!rect) return null;
    return { x: rect.left + 88, y: rect.top + 18 };
  }

  // Always aim at the transcript bottom — do not scroll the user there.
  const pad = document.querySelector<HTMLElement>("[data-agent-chat-transcript-bottom-pad]");
  if (pad) {
    const rect = pad.getBoundingClientRect();
    return { x: rect.right - 64, y: Math.max(24, rect.top - 12) };
  }
  const transcript = document.querySelector<HTMLElement>(
    "[data-agent-chat-column] [data-canvas-selectable-text]",
  );
  if (transcript) {
    const rect = transcript.getBoundingClientRect();
    return { x: rect.right - 72, y: rect.bottom - 48 };
  }
  const column = document.querySelector<HTMLElement>("[data-agent-chat-column]");
  if (!column) return null;
  const rect = column.getBoundingClientRect();
  return { x: rect.right - 72, y: rect.bottom - 160 };
}

export function buildComposerFlyingMessage({
  id,
  text,
  from,
  to,
}: {
  id: number;
  text: string;
  from: { x: number; y: number } | null;
  to: { x: number; y: number } | null;
}): ComposerFlyingMessage | null {
  if (!from || !to) return null;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return {
    id,
    text: trimmed.length > 90 ? `${trimmed.slice(0, 87)}...` : trimmed,
    from,
    to,
  };
}
