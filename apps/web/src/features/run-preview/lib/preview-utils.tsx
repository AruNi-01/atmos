import { AlertTriangle, ExternalLink, Monitor, SquareMousePointer } from "lucide-react";
import { createTranslator, useTranslations } from "next-intl";
import { Button, TextShimmer, cn } from "@workspace/ui";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import type { PreviewViewMode } from "@/shared/lib/nuqs/searchParams";
import { currentAppLocale } from "@/shared/lib/current-app-locale";

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

const PREVIEW_UTILS_NAMESPACE = "preview.utils";
const LEGACY_PREVIEW_LOAD_ERROR_TITLE = "Preview failed to load";
const LEGACY_PREVIEW_LOAD_ERROR_LINE = "Preview failed to load.";

let cachedPreviewUtilsLocale: "en" | "zh" | null = null;
let cachedPreviewUtilsTranslator: any = null;

const previewUtilsT = (key: string, values?: Record<string, string | number>): string => {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedPreviewUtilsTranslator || cachedPreviewUtilsLocale !== locale) {
    cachedPreviewUtilsLocale = locale;
    cachedPreviewUtilsTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: PREVIEW_UTILS_NAMESPACE,
    });
  }
  return cachedPreviewUtilsTranslator(key as never, values as never);
};

export const PREVIEW_SELECTION_UNAVAILABLE_MESSAGE = previewUtilsT("selection.unavailable");
export const PREVIEW_EXTENSION_REQUIRED_MESSAGE = previewUtilsT("selection.extensionRequired");

export const MAX_HISTORY_LENGTH = 100;

const EXPLICIT_SCHEME_PATTERN = /^[a-z][a-z\d+\-.]*:(?:\/\/|\/)/i;
const NON_HIERARCHICAL_SCHEME_PATTERN = /^(?:about|blob|data|mailto|sms|tel|urn):/i;
const HTTP_SCHEME_WITHOUT_SLASHES_PATTERN = /^(https?):(?!\/\/)/i;
const LOCAL_TARGET_WITHOUT_SCHEME_PATTERN =
  /^(localhost|127\.0\.0\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|\[::1\])(?::\d+)?(?:[/?#]|$)/i;

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

  if (HTTP_SCHEME_WITHOUT_SLASHES_PATTERN.test(trimmed)) {
    return trimmed.replace(HTTP_SCHEME_WITHOUT_SLASHES_PATTERN, "$1://");
  }

  if (LOCAL_TARGET_WITHOUT_SCHEME_PATTERN.test(trimmed)) {
    return `http://${trimmed}`;
  }

  if (EXPLICIT_SCHEME_PATTERN.test(trimmed) || NON_HIERARCHICAL_SCHEME_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  return `https://${trimmed}`;
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

const ATMOS_WORKSPACE_ROUTE_PATTERN = /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?workspace(?:\/|$)/;
const ATMOS_TITLE_SUFFIX_PATTERN = /\s+[–-]\s+ATMOS$/;

export const normalizePreviewPageTitle = (title: string, pageUrl: string): string => {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return "";

  try {
    const parsedUrl = new URL(pageUrl);
    if (!ATMOS_WORKSPACE_ROUTE_PATTERN.test(parsedUrl.pathname)) {
      return trimmedTitle;
    }
  } catch {
    return trimmedTitle;
  }

  const [workspaceLabel, ...titleParts] = trimmedTitle.split(" · ");
  const remainingTitle = titleParts.join(" · ").trim();
  if (!workspaceLabel?.includes("/") || !remainingTitle || !ATMOS_TITLE_SUFFIX_PATTERN.test(remainingTitle)) {
    return trimmedTitle;
  }

  return remainingTitle;
};

export const splitDisplayUrl = (value: string): { protocol: string; address: string } => {
  const normalized = normalizeUrl(value);
  if (!normalized) {
    return { protocol: "", address: "" };
  }

  const explicitScheme = normalized.match(/^([a-z][a-z\d+\-.]*:\/\/)(.*)$/i);
  if (explicitScheme) {
    return {
      protocol: explicitScheme[1],
      address: explicitScheme[2],
    };
  }

  const nonHierarchicalScheme = normalized.match(/^([a-z][a-z\d+\-.]*:)(.*)$/i);
  if (nonHierarchicalScheme) {
    return {
      protocol: nonHierarchicalScheme[1],
      address: nonHierarchicalScheme[2],
    };
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
  const nextTitle = title || previewUtilsT("error.title");
  const message = lines[0] || errorCode || previewUtilsT("error.browserLoadFailure");
  const details = lines.slice(1);

  return createPreviewLoadError(pageUrl, nextTitle, message, details);
};

export const createPreviewNetworkError = (url: string, error: unknown): PreviewLoadError => {
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : previewUtilsT("error.unknownNetwork");
  const errorCode = extractPreviewErrorCode(errorMessage);
  const details = errorCode ? [errorCode] : [];

  if (/^https:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(url)) {
    details.push(previewUtilsT("error.localHttpsHint"));
  }

  details.push(errorMessage);

  return createPreviewLoadError(
    url,
    previewUtilsT("error.title"),
    previewUtilsT("error.networkUnreachable"),
    details,
  );
};

const PreviewErrorCardContent = ({
  previewLoadError,
  handleRefresh,
}: {
  previewLoadError: PreviewLoadError;
  handleRefresh: () => void;
}) => {
  const t = useTranslations(PREVIEW_UTILS_NAMESPACE);

  return (
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
              {t("errorCard.urlLabel")}
            </div>
            <div className="mt-1 break-all font-mono text-xs text-foreground">
              {previewLoadError.url}
            </div>
          </div>
          {previewLoadError.details.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t("errorCard.detailsLabel")}
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
              {t("errorCard.retry")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                window.open(previewLoadError.url, "_blank", "noopener,noreferrer");
              }}
            >
              {t("errorCard.openInBrowser")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

export const renderPreviewErrorCard = (
  previewLoadError: PreviewLoadError,
  handleRefresh: () => void,
) => <PreviewErrorCardContent previewLoadError={previewLoadError} handleRefresh={handleRefresh} />;

const PreviewLoadingOverlayContent = ({ viewMode }: { viewMode: PreviewViewMode }) => {
  const t = useTranslations(PREVIEW_UTILS_NAMESPACE);

  return (
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
            {t("loading.label")}
          </TextShimmer>
        </div>
      </div>
    </div>
  </div>
  );
};

export const renderPreviewLoadingOverlay = (viewMode: PreviewViewMode) => (
  <PreviewLoadingOverlayContent viewMode={viewMode} />
);

const PreviewHomeContent = ({
  shouldStackPreviewHomeCards,
  shouldStackPreviewHomeNotes,
}: {
  shouldStackPreviewHomeCards: boolean;
  shouldStackPreviewHomeNotes: boolean;
}) => {
  const t = useTranslations(PREVIEW_UTILS_NAMESPACE);

  return (
  <div className="flex h-full w-full items-start justify-center overflow-y-auto px-4 py-8 sm:px-6 sm:py-10">
    <div className="w-full max-w-4xl">
      <div className="space-y-3">
        <div
          className={cn(
            "font-semibold tracking-tight text-foreground",
            shouldStackPreviewHomeCards ? "text-2xl" : "text-3xl sm:text-4xl",
          )}
        >
          {t("home.title")}
        </div>
        <p
          className={cn(
            "max-w-2xl leading-relaxed text-muted-foreground",
            shouldStackPreviewHomeCards ? "text-sm" : "text-base sm:text-lg",
          )}
        >
          {t("home.description")}
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
          <div className="mt-4 text-base font-medium text-foreground">
            {t("home.cards.previewPages.title")}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("home.cards.previewPages.description")}
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-background/70 p-5">
          <SquareMousePointer className="size-5 text-foreground" />
          <div className="mt-4 text-base font-medium text-foreground">
            {t("home.cards.selectElements.title")}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("home.cards.selectElements.description")}
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-background/70 p-5">
          <ExternalLink className="size-5 text-foreground" />
          <div className="mt-4 text-base font-medium text-foreground">
            {t("home.cards.workAcrossModes.title")}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("home.cards.workAcrossModes.description")}
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
            {t("home.notes.start.title")}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t.rich("home.notes.start.description", {
              enter: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
            })}
          </p>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {t("home.notes.crossPort.title")}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("home.notes.crossPort.description")}
          </p>
        </div>
      </div>
    </div>
  </div>
  );
};

export const renderPreviewHome = (
  shouldStackPreviewHomeCards: boolean,
  shouldStackPreviewHomeNotes: boolean,
) => (
  <PreviewHomeContent
    shouldStackPreviewHomeCards={shouldStackPreviewHomeCards}
    shouldStackPreviewHomeNotes={shouldStackPreviewHomeNotes}
  />
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
  const localizedLoadErrorTitle = previewUtilsT("error.title");
  const localizedLoadErrorLine = `${localizedLoadErrorTitle}.`;
  const hasStandardLoadErrorLine =
    lines[0] === LEGACY_PREVIEW_LOAD_ERROR_LINE || lines[0] === localizedLoadErrorLine;
  const isLoadError =
    hasStandardLoadErrorLine ||
    Boolean(extractPreviewErrorCode(joined)) ||
    PREVIEW_ERROR_PAGE_MARKERS.some((marker) => joined.includes(marker));

  if (!isLoadError) {
    return null;
  }

  const title =
    hasStandardLoadErrorLine || lines[0] === LEGACY_PREVIEW_LOAD_ERROR_TITLE
      ? localizedLoadErrorTitle
      : lines[0];
  const contentLines = hasStandardLoadErrorLine ? lines.slice(1) : lines;
  const primaryMessage = contentLines[0] ?? previewUtilsT("error.browserLoadFailure");
  const details = contentLines.slice(1);

  return createPreviewLoadError(fallbackUrl, title, primaryMessage, details);
};
