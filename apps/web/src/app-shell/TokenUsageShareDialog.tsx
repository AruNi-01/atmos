"use client";

import * as React from "react";
import { Download, Share2, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FacebookIcon,
  ImageGenerationCanvas,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RedditIcon,
  ThreadsIcon,
  XIcon,
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
import type { TokenUsageOverviewResponse } from "@/api/ws/token-usage-api";
import { TokenUsagePublishControls } from "@/features/token-usage/TokenUsagePublishControls";

type TokenUsageSharePopoverProps = {
  captureTargetRef: React.RefObject<HTMLElement | null>;
  locale: string;
  isDark: boolean;
  totalTokens: number;
  totalCost: number | null;
  overview?: TokenUsageOverviewResponse | null;
  disabled?: boolean;
};

const SOCIALS: Array<{
  id: SocialPlatform;
  label: string;
  Icon: React.ComponentType<{ className?: string; size?: number }>;
}> = [
  { id: "x", label: "X", Icon: XIcon },
  { id: "reddit", label: "Reddit", Icon: RedditIcon },
  { id: "facebook", label: "Facebook", Icon: FacebookIcon },
  { id: "threads", label: "Threads", Icon: ThreadsIcon },
];

/** Compact ~16:9 preview — image fills the box (object-cover). */
const PREVIEW_FRAME_H = 168;
const ACTIONS_ROW_H = 44;
const POPOVER_W = 320;

export function TokenUsageSharePopover({
  captureTargetRef,
  locale,
  isDark,
  totalTokens,
  totalCost,
  overview = null,
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
  const nestedDialogOpenRef = React.useRef(false);

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
      websiteLabel: t("websiteLabel"),
      isDark,
    });
  }, [captureTargetRef, isDark, t]);

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
      // While the full-size preview or nested sign-in dialog is open, keep the popover.
      if (
        !next &&
        (lightboxOpen || lightboxActiveRef.current || nestedDialogOpenRef.current)
      ) {
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
            "max-h-[min(80vh,720px)] overflow-y-auto rounded-[20px] border-border/70 p-0 shadow-[0_20px_60px_-28px_rgba(15,23,42,0.35)]",
          )}
          style={{ width: POPOVER_W, maxWidth: "calc(100vw - 1.5rem)" }}
          {...{ [SHARE_CAPTURE_EXCLUDE_ATTR]: "" }}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => {
            if (
              lightboxOpen ||
              nestedDialogOpenRef.current ||
              isDialogSurface(event.target)
            ) {
              event.preventDefault();
            }
          }}
          onFocusOutside={(event) => {
            if (
              lightboxOpen ||
              lightboxActiveRef.current ||
              nestedDialogOpenRef.current ||
              isDialogSurface(event.target)
            ) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (
              lightboxOpen ||
              nestedDialogOpenRef.current ||
              isDialogSurface(event.target)
            ) {
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
              ) : captureFailed ? (
                <div className="absolute inset-0 flex items-center justify-center px-3 text-center">
                  <span className="text-[11px] text-muted-foreground">
                    {t("errors.capture")}
                  </span>
                </div>
              ) : (
                <div className="absolute inset-0">
                  <ImageGenerationCanvas
                    theme={isDark ? "dark" : "light"}
                    aria-label={t("capturing")}
                    className="rounded-[16px]"
                  />
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
                  <Icon className="opacity-90" size={14} />
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

          <TokenUsagePublishControls
            overview={overview}
            disabled={disabled}
            onDialogOpenChange={(next) => {
              nestedDialogOpenRef.current = next;
              if (next) setOpen(true);
            }}
          />
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
