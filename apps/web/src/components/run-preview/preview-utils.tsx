import { AlertTriangle, ExternalLink, Monitor, SquareMousePointer } from "lucide-react";
import { Button, TextShimmer, cn } from "@workspace/ui";
import type { PreviewViewMode } from "@/lib/nuqs/searchParams";

export interface FavoriteSite {
  url: string;
  name?: string;
}

export interface PreviewLoadError {
  title: string;
  message: string;
  details: string[];
  url: string;
}

export const PREVIEW_SELECTION_UNAVAILABLE_MESSAGE =
  "Element selection is only available for same-origin or local preview pages.";
export const PREVIEW_EXTENSION_REQUIRED_MESSAGE =
  "Cross-port element selection requires the Atmos Inspector extension. Pages that reject iframe embedding must use the desktop preview.";

export const MAX_HISTORY_LENGTH = 100;

const PREVIEW_ERROR_PAGE_MARKERS = [
  "This site can’t provide a secure connection",
  "This site can't provide a secure connection",
  "This page isn’t working",
  "This page isn't working",
  "sent an invalid response",
  "ERR_SSL_PROTOCOL_ERROR",
  "ERR_CERT_",
  "ERR_CONNECTION_",
  "ERR_NAME_NOT_RESOLVED",
  "ERR_ADDRESS_UNREACHABLE",
  "ERR_INTERNET_DISCONNECTED",
  "此网站无法提供安全连接",
  "发送的响应无效",
];

export const normalizeUrl = (value: string): string => {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//.test(trimmed) === false && /^https?:/.test(trimmed)) {
    return trimmed.replace(/^(https?):/, "$1://");
  }

  if (!/^https?:\/\//.test(trimmed)) {
    const isLocal =
      /^(localhost|127\.0\.0\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(
        trimmed,
      );
    return isLocal ? `http://${trimmed}` : `https://${trimmed}`;
  }

  return trimmed;
};

export const canonicalizeUrl = (value: string): string => {
  const normalized = normalizeUrl(value);
  if (!normalized) return "";

  try {
    return new URL(normalized).toString();
  } catch {
    return normalized;
  }
};

export const isLocalPreviewTarget = (value: string): boolean => {
  if (!value) return false;

  try {
    const { hostname } = new URL(value);
    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      /^127\.\d+\.\d+\.\d+$/.test(hostname) ||
      /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
      /^192\.168\.\d+\.\d+$/.test(hostname)
    );
  } catch {
    return false;
  }
};

export const deriveFavoriteName = (title: string, url: string): string => {
  const trimmedTitle = title.trim();
  if (trimmedTitle) return trimmedTitle;

  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export const splitDisplayUrl = (value: string): { protocol: string; address: string } => {
  const normalized = normalizeUrl(value);
  if (!normalized) {
    return { protocol: "", address: "" };
  }

  try {
    const parsed = new URL(normalized);
    return {
      protocol: `${parsed.protocol}//`,
      address: `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`,
    };
  } catch {
    const matched = normalized.match(/^(https?:\/\/)(.*)$/i);
    if (matched) {
      return {
        protocol: matched[1],
        address: matched[2],
      };
    }
    return {
      protocol: "",
      address: normalized,
    };
  }
};

const extractPreviewErrorCode = (value: string): string | null =>
  value.match(/\bERR_[A-Z0-9_]+\b/)?.[0] ?? null;

const parseErrorLines = (value: string): string[] =>
  value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

export const createPreviewLoadError = (
  url: string,
  title: string,
  message: string,
  details: string[] = [],
): PreviewLoadError => ({
  title,
  message,
  details: details.filter(Boolean).slice(0, 6),
  url,
});

export const detectBrowserErrorDocument = (
  pageUrl: string,
  title: string,
  bodyText: string,
): PreviewLoadError | null => {
  const normalizedBody = bodyText.trim();
  const combined = `${title}\n${normalizedBody}`;
  const errorCode = extractPreviewErrorCode(combined);
  const hasMarker = PREVIEW_ERROR_PAGE_MARKERS.some((marker) => combined.includes(marker));
  const isBrowserErrorPage =
    /^chrome-error:\/\//.test(pageUrl) ||
    /^edge-error:\/\//.test(pageUrl) ||
    /^webkit-error-page:\/\//.test(pageUrl) ||
    Boolean(errorCode) ||
    hasMarker;

  if (!isBrowserErrorPage) {
    return null;
  }

  const lines = parseErrorLines(normalizedBody);
  const nextTitle = title || "Preview failed to load";
  const message = lines[0] || errorCode || "The target page reported a browser-level load failure.";
  const details = lines.slice(1);

  return createPreviewLoadError(pageUrl, nextTitle, message, details);
};

export const createPreviewNetworkError = (url: string, error: unknown): PreviewLoadError => {
  const errorMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown network error";
  const errorCode = extractPreviewErrorCode(errorMessage);
  const details = errorCode ? [errorCode] : [];

  if (/^https:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(url)) {
    details.push("The target local server may be speaking HTTP on an HTTPS URL or returning an invalid TLS response.");
  }

  details.push(errorMessage);

  return createPreviewLoadError(
    url,
    "Preview failed to load",
    "The target page could not be reached cleanly.",
    details,
  );
};

export const renderPreviewErrorCard = (
  previewLoadError: PreviewLoadError,
  handleRefresh: () => void,
) => (
  <div className="flex h-full w-full items-center justify-center px-4 py-6">
    <div className="w-full max-w-2xl rounded-2xl border border-border bg-background p-5 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-destructive/10 p-2 text-destructive">
          <AlertTriangle className="size-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-foreground">{previewLoadError.title}</div>
            <div className="text-sm leading-relaxed text-muted-foreground">
              {previewLoadError.message}
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              URL
            </div>
            <div className="mt-1 break-all font-mono text-xs text-foreground">
              {previewLoadError.url}
            </div>
          </div>
          {previewLoadError.details.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Details
              </div>
              <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                {previewLoadError.details.map((detail) => (
                  <div key={detail}>{detail}</div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleRefresh}>
              Retry
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                window.open(previewLoadError.url, "_blank", "noopener,noreferrer");
              }}
            >
              Open in browser
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const renderPreviewLoadingOverlay = (viewMode: PreviewViewMode) => (
  <div
    className={cn(
      "absolute inset-0 z-20 flex items-center justify-center bg-background",
      viewMode === "mobile" && "mx-auto w-[375px]",
    )}
  >
    <div className="flex h-full w-full flex-col justify-center px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-28 rounded bg-muted" />
            <div className="h-2.5 w-40 max-w-full rounded bg-muted/80 sm:w-56" />
          </div>
        </div>
        <div className="mt-6 space-y-4">
          <div className="h-[28vh] min-h-32 rounded-2xl bg-muted/50" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="h-16 rounded-xl bg-muted/60" />
            <div className="h-16 rounded-xl bg-muted/40" />
          </div>
        </div>
        <div className="mt-4">
          <TextShimmer as="p" duration={1.8} className="text-sm font-medium sm:text-base">
            Loading preview...
          </TextShimmer>
        </div>
      </div>
    </div>
  </div>
);

export const renderPreviewHome = (
  shouldStackPreviewHomeCards: boolean,
  shouldStackPreviewHomeNotes: boolean,
) => (
  <div className="flex h-full w-full items-start justify-center overflow-y-auto px-4 py-8 sm:px-6 sm:py-10">
    <div className="w-full max-w-4xl">
      <div className="space-y-3">
        <div
          className={cn(
            "font-semibold tracking-tight text-foreground",
            shouldStackPreviewHomeCards ? "text-2xl" : "text-3xl sm:text-4xl",
          )}
        >
          Preview
        </div>
        <p
          className={cn(
            "max-w-2xl leading-relaxed text-muted-foreground",
            shouldStackPreviewHomeCards ? "text-sm" : "text-base sm:text-lg",
          )}
        >
          Open a local app or website, inspect elements, and send clean page context to AI.
        </p>
      </div>

      <div
        className={cn(
          "mt-8 grid gap-4 md:mt-10",
          shouldStackPreviewHomeCards ? "grid-cols-1" : "grid-cols-3",
        )}
      >
        <div className="rounded-2xl border border-border/60 bg-background/70 p-5">
          <Monitor className="size-5 text-foreground" />
          <div className="mt-4 text-base font-medium text-foreground">Preview pages</div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Load localhost apps, internal tools, or any URL you want to inspect.
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-background/70 p-5">
          <SquareMousePointer className="size-5 text-foreground" />
          <div className="mt-4 text-base font-medium text-foreground">Select elements</div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Click elements to capture DOM context and source-component hints.
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-background/70 p-5">
          <ExternalLink className="size-5 text-foreground" />
          <div className="mt-4 text-base font-medium text-foreground">Work across modes</div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Same-origin works directly. Cross-port pages use the extension or desktop preview.
          </p>
        </div>
      </div>

      <div
        className={cn(
          "mt-6 grid gap-3 rounded-2xl border border-dashed border-border/70 bg-background/35 p-4 md:mt-8 md:p-5",
          shouldStackPreviewHomeNotes ? "grid-cols-1" : "grid-cols-2",
        )}
      >
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Start
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Enter a URL above and press <span className="font-medium text-foreground">Enter</span>.
          </p>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Cross-port
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            If a page is on another port, install the Atmos Inspector extension or use the desktop
            preview.
          </p>
        </div>
      </div>
    </div>
  </div>
);

export const parseTransportLoadError = (
  message: string,
  fallbackUrl: string,
): PreviewLoadError | null => {
  const lines = parseErrorLines(message);
  if (lines.length === 0) {
    return null;
  }

  const joined = lines.join("\n");
  const isLoadError =
    lines[0] === "Preview failed to load." ||
    Boolean(extractPreviewErrorCode(joined)) ||
    PREVIEW_ERROR_PAGE_MARKERS.some((marker) => joined.includes(marker));

  if (!isLoadError) {
    return null;
  }

  const title = lines[0] === "Preview failed to load." ? "Preview failed to load" : lines[0];
  const contentLines = lines[0] === "Preview failed to load." ? lines.slice(1) : lines;
  const primaryMessage = contentLines[0] ?? "The target page reported a browser-level load failure.";
  const details = contentLines.slice(1);

  return createPreviewLoadError(fallbackUrl, title, primaryMessage, details);
};
