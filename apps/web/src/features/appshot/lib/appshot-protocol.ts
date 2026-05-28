import type { AppshotRecordDetail, AppshotRecordSummary, AppshotQuality } from "../types";

export const APPSHOT_PROTOCOL_PREFIX = "atmos://appshots/";
export const APPSHOT_TIMESTAMP_PATTERN = /^\d{13}$/;

export type ParsedAppshotProtocol = {
  timestamp: string;
  protocolUrl: string;
  promptText: string;
};

export function isValidAppshotTimestamp(timestamp: string): boolean {
  return APPSHOT_TIMESTAMP_PATTERN.test(timestamp);
}

export function formatAppshotProtocolUrl(timestamp: string): string {
  assertValidTimestamp(timestamp);
  return `${APPSHOT_PROTOCOL_PREFIX}${timestamp}`;
}

export function formatAppshotPrompt(timestamp: string): string {
  assertValidTimestamp(timestamp);
  return `${formatAppshotProtocolUrl(timestamp)}
Appshot record is stored locally at ~/.atmos/appshots/records/${timestamp}/. Read metadata.json, context.md, and snapshot.png in that directory before answering. Inspect snapshot.png when visual context matters.`;
}

export function parseAppshotProtocol(text: string): ParsedAppshotProtocol | null {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = normalized.split("\n", 1)[0]?.trim() ?? "";
  if (!firstLine.startsWith(APPSHOT_PROTOCOL_PREFIX)) {
    return null;
  }

  const timestamp = firstLine.slice(APPSHOT_PROTOCOL_PREFIX.length);
  if (!isValidAppshotTimestamp(timestamp)) {
    return null;
  }

  return {
    timestamp,
    protocolUrl: formatAppshotProtocolUrl(timestamp),
    promptText: formatAppshotPrompt(timestamp),
  };
}

export function summarizeAppshotRecord(record: AppshotRecordDetail): AppshotRecordSummary {
  const { metadata } = record;
  return {
    timestamp: record.timestamp,
    appLabel: metadata.app_name || "Unknown app",
    capturedAtLabel: formatAppshotTimestamp(metadata.captured_at || record.timestamp),
    qualityLabel: formatQualityLabel(metadata.quality),
    title: metadata.window_title?.trim() || metadata.app_name || `Appshot ${record.timestamp}`,
  };
}

export function formatAppshotTimestamp(value: string): string {
  const fromIso = new Date(value);
  const date = Number.isNaN(fromIso.getTime()) && isValidAppshotTimestamp(value)
    ? new Date(Number(value))
    : fromIso;

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatQualityLabel(quality: AppshotQuality): string {
  switch (quality) {
    case "screenshot_and_accessibility":
      return "Screenshot + UI tree";
    case "screenshot_only":
      return "Screenshot only";
    case "accessibility_only":
      return "UI tree only";
    case "metadata_only":
      return "Metadata only";
    case "unsupported":
      return "Unsupported";
    default:
      return quality;
  }
}

function assertValidTimestamp(timestamp: string): void {
  if (!isValidAppshotTimestamp(timestamp)) {
    throw new Error("Invalid Appshot timestamp");
  }
}
