import type { SelectionInfo } from "@/shared/lib/format-selection-for-ai";
import { invokeDesktopBrowserBridge } from "@/shared/lib/desktop-browser-bridge";
import { isDesktopRuntime } from "@/shared/lib/desktop-runtime";
import type { PreviewSelectionAnnotation } from "../hooks/use-browser-selection";

export type BrowserUsePickPayload = {
  id?: string;
  selector: string;
  name?: string;
  note?: string;
  tag?: string;
  rect?: { x: number; y: number; width: number; height: number };
};

export function selectionInfoToBrowserUsePick(
  info: SelectionInfo,
  extra?: { id?: string; note?: string },
): BrowserUsePickPayload | null {
  const selector = info.selector?.trim();
  if (!selector) return null;
  return {
    id: extra?.id,
    selector,
    name: (info.textPreview || info.selectedText || info.tagName || selector).slice(0, 120),
    note: extra?.note,
    tag: info.tagName,
    rect: info.previewRect,
  };
}

export async function pushBrowserUseUserPicks(input: {
  sessionId: string;
  current: SelectionInfo | null;
  annotations: PreviewSelectionAnnotation[];
}): Promise<void> {
  if (!isDesktopRuntime() || !input.sessionId.trim()) return;
  const current = input.current
    ? selectionInfoToBrowserUsePick(input.current)
    : null;
  const annotations = input.annotations
    .map((annotation) =>
      selectionInfoToBrowserUsePick(annotation.info, {
        id: annotation.id,
        note: annotation.note,
      }),
    )
    .filter((pick): pick is BrowserUsePickPayload => pick != null);
  await invokeDesktopBrowserBridge("browser_bridge_user_picks", {
    sessionId: input.sessionId,
    current,
    annotations,
  });
}
