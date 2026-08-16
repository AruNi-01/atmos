"use client";

import * as React from "react";
import { Download, Globe, Share2, X } from "lucide-react";
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/motion/tabs";
import { motion, useReducedMotion } from "motion/react";
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
import { hubConfigured } from "@/api/hub-client";
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
const TAB_EASE = [0.22, 1, 0.36, 1] as const;

function SharePublishPanels({
  tab,
  share,
  publish,
}: {
  tab: string;
  share: React.ReactNode;
  publish: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const publishRef = React.useRef<HTMLDivElement>(null);
  const shareRef = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number | "auto">("auto");

  React.useLayoutEffect(() => {
    const el = tab === "publish" ? publishRef.current : shareRef.current;
    if (!el) return;
    const apply = () => {
      const next = el.offsetHeight;
      setHeight((prev) => (prev === next ? prev : next));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab]);

  return (
    <motion.div
      initial={false}
      animate={reduce || height === "auto" ? undefined : { height }}
      transition={{ duration: 0.3, ease: TAB_EASE }}
      className="overflow-hidden"
    >
      <div className="relative">
        <motion.div
          ref={publishRef}
          initial={false}
          animate={{
            opacity: tab === "publish" ? 1 : 0,
            scale: tab === "publish" ? 1 : 0.96,
          }}
          transition={{ duration: reduce ? 0 : 0.22, ease: TAB_EASE }}
          className={cn(
            "origin-top",
            tab === "publish"
              ? "relative"
              : "pointer-events-none absolute inset-x-0 top-0",
          )}
          aria-hidden={tab !== "publish"}
          inert={tab !== "publish" ? true : undefined}
        >
          {publish}
        </motion.div>
        <motion.div
          ref={shareRef}
          initial={false}
          animate={{
            opacity: tab === "share" ? 1 : 0,
            scale: tab === "share" ? 1 : 0.96,
          }}
          transition={{ duration: reduce ? 0 : 0.22, ease: TAB_EASE }}
          className={cn(
            "origin-top",
            tab === "share"
              ? "relative"
              : "pointer-events-none absolute inset-x-0 top-0",
          )}
          aria-hidden={tab !== "share"}
          inert={tab !== "share" ? true : undefined}
        >
          {share}
        </motion.div>
      </div>
    </motion.div>
  );
}

function ShareCardBody({
  isDark,
  previewUrl,
  captureFailed,
  blob,
  disabled,
  busy,
  onOpenLightbox,
  onSocial,
  onSave,
}: {
  isDark: boolean;
  previewUrl: string | null;
  captureFailed: boolean;
  blob: Blob | null;
  disabled?: boolean;
  busy: boolean;
  onOpenLightbox: () => void;
  onSocial: (platform: SocialPlatform) => void;
  onSave: () => void;
}) {
  const t = useTranslations("appShell.tokenUsageDialog.share");
  return (
    <>
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
                onOpenLightbox();
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
              onClick={() => onSocial(id)}
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
          onClick={onSave}
          aria-label={t("save")}
          title={t("save")}
          className="size-8 shrink-0"
        >
          <Download className="size-3.5 opacity-90" aria-hidden />
        </Button>
      </div>
    </>
  );
}

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
  const publishT = useTranslations("appShell.tokenUsageDialog.publish");
  const canPublish = hubConfigured();
  const [tab, setTab] = React.useState("publish");
  const [open, setOpen] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const clampYRef = React.useRef(0);
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
      if (!next) setTab("publish");
    },
    [lightboxOpen],
  );

  const clampBelowHeader = React.useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const page = document.querySelector("[data-token-usage-page-scroll]");
    const header = document.querySelector("[data-app-shell-header]");
    const minTop =
      Math.max(
        page?.getBoundingClientRect().top ?? 0,
        header?.getBoundingClientRect().bottom ?? 48,
      ) + 8;
    const overflow = minTop - el.getBoundingClientRect().top;
    if (overflow > 0.5) {
      clampYRef.current += overflow;
    } else if (overflow < -0.5 && clampYRef.current > 0) {
      clampYRef.current = Math.max(0, clampYRef.current + overflow);
    } else {
      return;
    }
    el.style.marginTop = clampYRef.current > 0 ? `${clampYRef.current}px` : "";
  }, []);

  React.useEffect(() => {
    if (!open) {
      clampYRef.current = 0;
      contentRef.current?.style.removeProperty("margin-top");
      return;
    }
    let raf = 0;
    const tick = () => {
      clampBelowHeader();
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [clampBelowHeader, open]);

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
          ref={contentRef}
          align="end"
          side="bottom"
          sideOffset={8}
          sticky="always"
          hideWhenDetached={false}
          updatePositionStrategy="always"
          collisionPadding={{ top: 56, right: 8, bottom: 8, left: 8 }}
          className={cn(
            "max-h-[min(80vh,720px)] overflow-hidden rounded-[20px] border-border/70 p-0 shadow-[0_20px_60px_-28px_rgba(15,23,42,0.35)]",
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
          {canPublish ? (
            <Tabs
              value={tab}
              onValueChange={setTab}
              variant="pill"
              className="flex flex-col"
            >
              <div className="px-2.5 pt-2.5">
                <TabsList className="h-8 gap-0.5 p-0.5">
                  <TabsTrigger value="share" className="h-7 gap-1.5 px-3 text-xs">
                    <Share2 className="size-3.5 shrink-0" aria-hidden />
                    {t("tab")}
                  </TabsTrigger>
                  <TabsTrigger value="publish" className="h-7 gap-1.5 px-3 text-xs">
                    <Globe className="size-3.5 shrink-0" aria-hidden />
                    {publishT("tab")}
                  </TabsTrigger>
                </TabsList>
              </div>
              <SharePublishPanels
                tab={tab}
                publish={
                  <TokenUsagePublishControls
                    overview={overview}
                    disabled={disabled}
                    onDialogOpenChange={(next) => {
                      nestedDialogOpenRef.current = next;
                      if (next) setOpen(true);
                    }}
                  />
                }
                share={
                  <ShareCardBody
                    isDark={isDark}
                    previewUrl={previewUrl}
                    captureFailed={captureFailed}
                    blob={blob}
                    disabled={disabled}
                    busy={busy}
                    onOpenLightbox={openLightbox}
                    onSocial={handleSocial}
                    onSave={handleSave}
                  />
                }
              />
            </Tabs>
          ) : (
            <ShareCardBody
              isDark={isDark}
              previewUrl={previewUrl}
              captureFailed={captureFailed}
              blob={blob}
              disabled={disabled}
              busy={busy}
              onOpenLightbox={openLightbox}
              onSocial={handleSocial}
              onSave={handleSave}
            />
          )}
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
