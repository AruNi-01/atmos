import type { AppshotRecordDetail, AppshotRecordSummary, AppshotQuality } from "../types";
import { createTranslator } from "next-intl";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

export const APPSHOT_PROTOCOL_PREFIX = "atmos://appshots/";
export const APPSHOT_TIMESTAMP_PATTERN = /^\d{13}$/;

export type ParsedAppshotProtocol = {
  timestamp: string;
  protocolUrl: string;
  promptText: string;
};

let cachedAppshotLibLocale: "en" | "zh" | null = null;
let cachedAppshotLibTranslator: any = null;

function appshotLibT(
  key: string,
  values?: Record<string, string | number>,
): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedAppshotLibTranslator || cachedAppshotLibLocale !== locale) {
    cachedAppshotLibLocale = locale;
    cachedAppshotLibTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "appshot.lib",
    });
  }
  return cachedAppshotLibTranslator(key as never, values as never);
}

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
${appshotLibT("protocol.promptBody", { timestamp })}`;
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
    appLabel: metadata.app_name || appshotLibT("protocol.unknownApp"),
    capturedAtLabel: formatAppshotTimestamp(metadata.captured_at || record.timestamp),
    qualityLabel: formatQualityLabel(metadata.quality),
    title:
      metadata.window_title?.trim() ||
      metadata.app_name ||
      appshotLibT("protocol.appshotTitle", { timestamp: record.timestamp }),
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

  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hour = padDatePart(date.getHours());
  const minute = padDatePart(date.getMinutes());

  return `${month}-${day} ${hour}:${minute}`;
}

export function formatQualityLabel(quality: AppshotQuality): string {
  switch (quality) {
    case "screenshot_and_accessibility":
      return appshotLibT("protocol.quality.screenshotAndUiTree");
    case "screenshot_only":
      return appshotLibT("protocol.quality.screenshotOnly");
    case "accessibility_only":
      return appshotLibT("protocol.quality.uiTreeOnly");
    case "metadata_only":
      return appshotLibT("protocol.quality.metadataOnly");
    case "unsupported":
      return appshotLibT("protocol.quality.unsupported");
    default:
      return quality;
  }
}

function assertValidTimestamp(timestamp: string): void {
  if (!isValidAppshotTimestamp(timestamp)) {
    throw new Error(appshotLibT("protocol.invalidTimestamp"));
  }
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}
