import type { LocalService } from "@/features/local-services/types";

const LOOPBACK_HOST_PATTERN = /^127\.\d+\.\d+\.\d+$/;

function parseDisplayUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
  } catch {
    return null;
  }
}

export function localServiceOpenUrl(service: LocalService): string | null {
  const rawUrl = service.url?.trim();
  if (!rawUrl) return null;

  const displayUrl = parseDisplayUrl(service.display_url);
  if (!displayUrl || displayUrl.hostname !== "localhost") {
    return rawUrl;
  }

  try {
    const parsed = new URL(rawUrl);
    const isLoopback =
      parsed.hostname === "localhost" ||
      parsed.hostname === "[::1]" ||
      LOOPBACK_HOST_PATTERN.test(parsed.hostname);

    if (!isLoopback || parsed.port !== displayUrl.port) {
      return rawUrl;
    }

    parsed.hostname = "localhost";
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}
