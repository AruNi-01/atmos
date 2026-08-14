"use client";

import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, cn } from "@workspace/ui";

import type { BrowserCookieAccessResponse } from "@/api/ws/token-usage-api";

export function TokenUsageCookieConsentBanner({
  items,
  busy,
  onAllow,
  onSkip,
  onEnable,
  className,
}: {
  items: BrowserCookieAccessResponse[] | undefined;
  busy: boolean;
  onAllow: (providerIds: string[]) => void;
  onSkip: (providerIds: string[]) => void;
  onEnable: (providerIds: string[]) => void;
  className?: string;
}) {
  const t = useTranslations("appShell.tokenUsageDialog.browserCookie");
  const pending = (items ?? []).filter(
    (item) => item.detected && !item.has_manual_token && item.consent === "needed",
  );
  const denied = (items ?? []).filter(
    (item) => item.detected && !item.has_manual_token && item.consent === "denied",
  );

  if (pending.length === 0 && denied.length === 0) {
    return null;
  }

  const productLabel = (list: BrowserCookieAccessResponse[]) =>
    list.map((item) => item.label).join(", ");

  if (pending.length === 0) {
    const providerIds = denied.map((item) => item.provider_id);
    return (
      <div
        className={cn(
          "flex w-56 flex-col gap-2.5 rounded-2xl border border-border/50 bg-background/95 px-3 py-3 shadow-lg backdrop-blur-md",
          className,
        )}
        role="status"
      >
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t("denied", { products: productLabel(denied) })}
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-[11px]"
          disabled={busy}
          onClick={() => onEnable(providerIds)}
        >
          {t("enable")}
        </Button>
      </div>
    );
  }

  return (
    <div
      role="note"
      className={cn(
        "flex w-56 gap-2.5 rounded-2xl border border-border/50 bg-background/95 px-3 py-3 shadow-lg backdrop-blur-md",
        className,
      )}
    >
      <KeyRound className="mt-0.5 size-3.5 shrink-0 text-foreground/70" />
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground">{t("title")}</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t("note", { products: productLabel(pending) })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            disabled={busy}
            onClick={() => onAllow(pending.map((item) => item.provider_id))}
          >
            {t("allow")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-[11px]"
            disabled={busy}
            onClick={() => onSkip(pending.map((item) => item.provider_id))}
          >
            {t("skip")}
          </Button>
        </div>
      </div>
    </div>
  );
}
