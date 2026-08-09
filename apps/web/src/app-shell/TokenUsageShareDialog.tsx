"use client";

import * as React from "react";
import { Download, Share2, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
  toastManager,
} from "@workspace/ui";
import { useTranslations } from "next-intl";

import {
  ATMOS_SITE_HOST,
  ATMOS_SITE_URL,
  ATMOS_SLOGAN,
  SHARE_CAPTURE_EXCLUDE_ATTR,
  buildShareText,
  buildSocialShareUrl,
  captureShareCardPng,
  copyImageBlobToClipboard,
  downloadBlob,
  tryNativeShare,
  type SocialPlatform,
} from "@/app-shell/token-usage-share-card";
import {
  formatCompactNumber,
  formatCurrencyCompact,
} from "@/app-shell/token-usage-dialog-utils";

type TokenUsageSharePopoverProps = {
  captureTargetRef: React.RefObject<HTMLElement | null>;
  locale: string;
  isDark: boolean;
  totalTokens: number;
  totalCost: number | null;
  disabled?: boolean;
};

const SOCIALS: Array<{
  id: SocialPlatform;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "x", label: "X", Icon: XIcon },
  { id: "reddit", label: "Reddit", Icon: RedditIcon },
  { id: "facebook", label: "Facebook", Icon: FacebookIcon },
  { id: "threads", label: "Threads", Icon: ThreadsIcon },
];

/** Compact ~16:9 preview — image fills the box (object-cover). */
const PREVIEW_FRAME_H = 168;
const ACTIONS_ROW_H = 44;
const POPOVER_W = 300;

export function TokenUsageSharePopover({
  captureTargetRef,
  locale,
  isDark,
  totalTokens,
  totalCost,
  disabled,
}: TokenUsageSharePopoverProps) {
  const t = useTranslations("appShell.tokenUsageDialog.share");
  const [open, setOpen] = React.useState(false);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [captureFailed, setCaptureFailed] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [blob, setBlob] = React.useState<Blob | null>(null);
  const previewUrlRef = React.useRef<string | null>(null);
  /** True while lightbox is open or was opened from this popover — keep popover open. */
  const lightboxActiveRef = React.useRef(false);

  const notify = React.useCallback(
    (title: string, type: "success" | "error" | "info" = "info") => {
      toastManager.add({ title, type });
    },
    [],
  );

  const primaryLine = React.useMemo(() => {
    const tokens = formatCompactNumber(totalTokens, locale);
    const cost = formatCurrencyCompact(totalCost, locale);
    return t("sharePrimary", { tokens, cost });
  }, [locale, t, totalCost, totalTokens]);

  const shareText = React.useMemo(
    () =>
      buildShareText({
        primaryLine,
        slogan: ATMOS_SLOGAN,
        siteUrl: ATMOS_SITE_URL,
      }),
    [primaryLine],
  );

  const filename = React.useMemo(() => {
    const stamp = new Date().toISOString().slice(0, 10);
    return `atmos-token-usage-${stamp}.png`;
  }, []);

  const revokePreview = React.useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setBlob(null);
  }, []);

  const captureCard = React.useCallback(async (): Promise<Blob> => {
    const target = captureTargetRef.current;
    if (!target) {
      throw new Error("missing capture target");
    }
    return captureShareCardPng(target, {
      backgroundColor: isDark ? "#0c0c0c" : "#efefef",
      pixelRatio: Math.min(2, window.devicePixelRatio || 2),
      slogan: ATMOS_SLOGAN,
      siteHost: ATMOS_SITE_HOST,
      isDark,
    });
  }, [captureTargetRef, isDark]);

  // Capture when popover opens. Keep blob alive while lightbox is open even if
  // the popover closes (clicking preview would otherwise revoke URL immediately).
  React.useEffect(() => {
    if (!open) {
      setBusy(false);
      setCaptureFailed(false);
      return;
    }

    let cancelled = false;
    setBusy(true);
    setCaptureFailed(false);

    void (async () => {
      try {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
          });
        });
        if (cancelled) return;
        const nextBlob = await captureCard();
        if (cancelled) return;
        const nextUrl = URL.createObjectURL(nextBlob);
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
        }
        previewUrlRef.current = nextUrl;
        setPreviewUrl(nextUrl);
        setBlob(nextBlob);
        setCaptureFailed(false);
      } catch {
        if (!cancelled) {
          revokePreview();
          setCaptureFailed(true);
          notify(t("errors.capture"), "error");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [captureCard, notify, open, revokePreview, t]);

  // Only drop the blob when both popover and lightbox are closed.
  React.useEffect(() => {
    if (!open && !lightboxOpen) {
      revokePreview();
    }
  }, [open, lightboxOpen, revokePreview]);

  React.useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const ensureBlob = React.useCallback(async (): Promise<Blob | null> => {
    if (blob) return blob;
    try {
      setBusy(true);
      const next = await captureCard();
      const nextUrl = URL.createObjectURL(next);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      previewUrlRef.current = nextUrl;
      setPreviewUrl(nextUrl);
      setBlob(next);
      setCaptureFailed(false);
      return next;
    } catch {
      setCaptureFailed(true);
      notify(t("errors.capture"), "error");
      return null;
    } finally {
      setBusy(false);
    }
  }, [blob, captureCard, notify, t]);

  const handleSave = React.useCallback(() => {
    void (async () => {
      const next = await ensureBlob();
      if (!next) return;
      downloadBlob(next, filename);
      notify(t("status.saved"), "success");
    })();
  }, [ensureBlob, filename, notify, t]);

  const handleSocial = React.useCallback(
    (platform: SocialPlatform) => {
      void (async () => {
        const next = await ensureBlob();
        if (!next) return;

        // 1) Best: OS share sheet with the PNG file attached (mobile / some desktop).
        const native = await tryNativeShare({
          blob: next,
          filename,
          title: t("dialogTitle"),
          text: shareText,
          url: ATMOS_SITE_URL,
        });
        if (native === "shared") {
          notify(t("status.sharedWithImage"), "success");
          return;
        }
        if (native === "cancelled") {
          // User dismissed the sheet — don't open a second compose window.
          return;
        }

        // 2) Desktop web intents cannot attach files. Copy image (+ text) so the
        //    user can paste into the compose box after it opens.
        const copied = await copyImageBlobToClipboard(next, shareText);
        // Let the clipboard flush before navigation steals user activation.
        await new Promise((resolve) => window.setTimeout(resolve, 80));

        const intent = buildSocialShareUrl(platform, {
          text: shareText,
          siteUrl: ATMOS_SITE_URL,
        });
        window.open(intent, "_blank", "noopener,noreferrer");

        if (copied) {
          notify(t("status.copiedOpen"), "success");
        } else {
          // Clipboard blocked — download so they can attach the file manually.
          downloadBlob(next, filename);
          notify(t("status.downloadedOpen"), "info");
        }
      })();
    },
    [ensureBlob, filename, notify, shareText, t],
  );

  const handlePopoverOpenChange = React.useCallback(
    (next: boolean) => {
      // While the full-size preview is open (or just closing), do not dismiss the popover.
      if (!next && (lightboxOpen || lightboxActiveRef.current)) {
        return;
      }
      setOpen(next);
    },
    [lightboxOpen],
  );

  const openLightbox = React.useCallback(() => {
    lightboxActiveRef.current = true;
    setLightboxOpen(true);
    // Ensure popover stays marked open under the dialog.
    setOpen(true);
  }, []);

  const handleLightboxOpenChange = React.useCallback((next: boolean) => {
    setLightboxOpen(next);
    if (!next) {
      // Dialog closed: keep popover open, clear the guard on next tick.
      setOpen(true);
      window.requestAnimationFrame(() => {
        lightboxActiveRef.current = false;
      });
    }
  }, []);

  const isDialogSurface = React.useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest('[data-slot="dialog-content"]') ||
        target.closest('[data-slot="dialog-overlay"]') ||
        target.closest("[data-radix-dialog-content]") ||
        target.closest("[role='dialog']"),
    );
  }, []);

  return (
    <>
      <Popover open={open} onOpenChange={handlePopoverOpenChange} modal={false}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled || busy}
            className="shrink-0"
            aria-label={t("trigger")}
            title={t("trigger")}
            {...{ [SHARE_CAPTURE_EXCLUDE_ATTR]: "" }}
          >
            <Share2 className="size-4" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          sideOffset={8}
          className={cn(
            "overflow-hidden rounded-[20px] border-border/70 p-0 shadow-[0_20px_60px_-28px_rgba(15,23,42,0.35)]",
          )}
          style={{ width: POPOVER_W, maxWidth: "calc(100vw - 1.5rem)" }}
          {...{ [SHARE_CAPTURE_EXCLUDE_ATTR]: "" }}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => {
            if (lightboxOpen || isDialogSurface(event.target)) {
              event.preventDefault();
            }
          }}
          onFocusOutside={(event) => {
            if (lightboxOpen || lightboxActiveRef.current) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (lightboxOpen || isDialogSurface(event.target)) {
              event.preventDefault();
            }
          }}
        >
          {/* Preview fills the frame (object-cover) — same size loading & ready */}
          <div className="p-2.5 pb-2">
            <div
              className={cn(
                "relative w-full overflow-hidden rounded-[16px] border",
                isDark ? "border-white/10 bg-black/30" : "border-black/8 bg-muted/30",
              )}
              style={{ height: PREVIEW_FRAME_H }}
            >
              {previewUrl ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openLightbox();
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  className="absolute inset-0 block cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t("openPreview")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob preview */}
                  <img
                    src={previewUrl}
                    alt={t("previewAlt")}
                    className="h-full w-full object-cover object-top"
                  />
                </button>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full",
                      busy ? "animate-pulse" : "",
                      isDark ? "bg-white/10" : "bg-black/10",
                    )}
                    aria-hidden
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {captureFailed ? t("errors.capture") : t("capturing")}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Fixed-height actions row: social icons + save (no divider) */}
          <div
            className="flex w-full shrink-0 items-center gap-1 px-2 pb-1.5"
            style={{ height: ACTIONS_ROW_H }}
          >
            <div className="flex h-8 min-w-0 flex-1 items-center gap-0.5">
              {SOCIALS.map(({ id, label, Icon }) => (
                <Button
                  key={id}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled || busy || !blob}
                  onClick={() => handleSocial(id)}
                  aria-label={label}
                  title={label}
                  className="size-8 shrink-0"
                >
                  <Icon className="size-3.5 opacity-90" />
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled || busy || !blob}
              onClick={handleSave}
              aria-label={t("save")}
              title={t("save")}
              className="size-8 shrink-0"
            >
              <Download className="size-3.5 opacity-90" aria-hidden />
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Full-size preview — size to image, not a wide empty shell */}
      <Dialog open={lightboxOpen} onOpenChange={handleLightboxOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="w-auto max-w-[min(96vw,720px)] overflow-hidden rounded-[20px] border-border/70 p-0 sm:max-w-[min(96vw,720px)]"
          {...{ [SHARE_CAPTURE_EXCLUDE_ATTR]: "" }}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            // Keep focus from collapsing the popover when dialog unmounts.
            event.preventDefault();
          }}
        >
          <DialogTitle className="sr-only">{t("previewAlt")}</DialogTitle>
          <div className="relative inline-block max-h-[88vh] max-w-[min(96vw,720px)]">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2 z-10 size-8 bg-background/80 backdrop-blur-sm"
              onClick={() => handleLightboxOpenChange(false)}
              aria-label={t("closePreview")}
            >
              <X className="size-4" />
            </Button>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob preview
              <img
                src={previewUrl}
                alt={t("previewAlt")}
                className="block h-auto max-h-[88vh] w-auto max-w-[min(96vw,720px)] object-contain"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** @deprecated Use TokenUsageSharePopover */
export const TokenUsageShareDialog = TokenUsageSharePopover;

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn(className)} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

function RedditIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn(className)} aria-hidden>
      <path d="M12 2C6.48 2 2 6.18 2 11.33c0 3.35 2.13 6.25 5.24 7.72-.07.61-.42 2.2.27 3.07 0 0 1.3-.52 3.08-1.58.86.17 1.77.26 2.71.26 5.52 0 10-4.18 10-9.33S17.52 2 12 2zm5.55 10.99c.1.92.13 1.87.06 2.78-.01.18-.19.29-.36.23-1.3-.44-2.57-1.05-3.7-1.82-.13-.09-.14-.28-.02-.39.67-.63 1.22-1.37 1.62-2.18.07-.14.24-.19.38-.12.74.38 1.4.91 2.02 1.5zm-11.1 0c.62-.59 1.28-1.12 2.02-1.5.14-.07.31-.02.38.12.4.81.95 1.55 1.62 2.18.12.11.11.3-.02.39-1.13.77-2.4 1.38-3.7 1.82-.17.06-.35-.05-.36-.23-.07-.91-.04-1.86.06-2.78zM12 17.4c-1.93 0-3.64-.64-4.73-1.63-.13-.12-.14-.32-.02-.45.67-.72 1.62-1.23 2.7-1.47.13-.03.27.04.32.16.28.68.72 1.27 1.29 1.71.14.1.14.3 0 .41-.18.14-.37.27-.56.37.99.24 2.08.24 3.07 0-.19-.1-.38-.23-.56-.37-.14-.11-.14-.31 0-.41.57-.44 1.01-1.03 1.29-1.71.05-.12.19-.19.32-.16 1.08.24 2.03.75 2.7 1.47.12.13.11.33-.02.45-1.09.99-2.8 1.63-4.73 1.63z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn(className)} aria-hidden>
      <path d="M22 12.07C22 6.48 17.52 2 11.93 2S1.86 6.48 1.86 12.07c0 4.99 3.63 9.13 8.38 9.93v-7.02H7.9v-2.91h2.34V9.84c0-2.32 1.38-3.6 3.49-3.6.99 0 2.03.18 2.03.18v2.23h-1.14c-1.12 0-1.47.7-1.47 1.42v1.7h2.5l-.4 2.91h-2.1V22c4.75-.8 8.38-4.94 8.38-9.93z" />
    </svg>
  );
}

function ThreadsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn(className)} aria-hidden>
      <path d="M16.3 11.15c-.1-2.48-1.49-4.13-4.22-4.17-1.74-.03-3.19.8-3.82 2.17l1.66.71c.41-.9 1.3-1.35 2.2-1.34 1.56.02 2.32.91 2.37 2.55-1.03-.18-2.14-.22-3.28-.12-1.92.17-3.53 1.1-3.44 3.13.05 1.18.67 2.2 1.79 2.75 1.14.57 2.61.64 3.75.21 1.26-.47 2.12-1.55 2.48-3.23.65.4 1.19.92 1.57 1.53.69 1.12.91 2.68.54 4.12-.42 1.66-1.56 2.8-3.24 3.24-1.38.36-2.98.24-4.35-.32-1.67-.68-2.87-1.95-3.37-3.58l-1.76.68c.65 2.2 2.3 3.94 4.53 4.84 1.74.7 3.8.86 5.66.37 2.44-.64 4.12-2.37 4.73-4.84.58-2.33.2-4.66-1.05-6.58-.77-1.18-1.9-2.1-3.24-2.67zm-2.43 4.03c-.66.45-1.65.61-2.46.45-.98-.19-1.42-.75-1.44-1.25-.03-.8.66-1.32 2.12-1.45.65-.06 1.63-.04 2.44.1-.2 1.03-.66 1.85-1.66 2.15z" />
    </svg>
  );
}
