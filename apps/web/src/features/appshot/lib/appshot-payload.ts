import type { AppshotPendingPreview, AppshotRecordDetail } from "../types";

export const MAX_INLINE_APPSHOT_IMAGE_CHARS = 512 * 1024;
const OVERSIZED_WARNING =
  "Screenshot preview was hidden because the inline image payload is too large.";

export function toBoundedScreenshotDataUrl(payload: string | null): string | null {
  if (!payload) {
    return null;
  }

  const dataUrl = payload.startsWith("data:")
    ? payload
    : `data:image/png;base64,${payload}`;

  if (dataUrl.length > MAX_INLINE_APPSHOT_IMAGE_CHARS) {
    return null;
  }

  return dataUrl;
}

export function sanitizePendingPreviewPayload(
  preview: AppshotPendingPreview,
): AppshotPendingPreview {
  if (!preview.screenshot_preview_base64) {
    return preview;
  }

  if (toBoundedScreenshotDataUrl(preview.screenshot_preview_base64)) {
    return preview;
  }

  return {
    ...preview,
    screenshot_preview_base64: null,
    warnings: appendOversizedWarning(preview.warnings),
  };
}

export function sanitizeRecordDetailPayload(
  detail: AppshotRecordDetail,
): AppshotRecordDetail {
  if (!detail.snapshot_url || toBoundedScreenshotDataUrl(detail.snapshot_url)) {
    return detail;
  }

  return {
    ...detail,
    snapshot_url: null,
    metadata: {
      ...detail.metadata,
      warnings: appendOversizedWarning(detail.metadata.warnings),
    },
  };
}

export function sanitizeRecordDetailPayloads(
  details: AppshotRecordDetail[],
): AppshotRecordDetail[] {
  return details.map(sanitizeRecordDetailPayload);
}

function appendOversizedWarning(warnings: string[]): string[] {
  if (warnings.includes(OVERSIZED_WARNING)) {
    return warnings;
  }
  return [...warnings, OVERSIZED_WARNING];
}
