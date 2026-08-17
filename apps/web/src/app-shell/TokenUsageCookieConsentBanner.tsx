"use client";

import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, cn } from "@workspace/ui";

import type { BrowserCookieAccessResponse } from "@/api/ws/token-usage-api";

const CARD_CLASS =
  "flex w-72 flex-col rounded-2xl border border-border/60 bg-background/95 p-3.5 shadow-lg backdrop-blur-md";

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
      <div className={cn(CARD_CLASS, className)} role="status">
        <div className="flex gap-2.5">
          <KeyRound className="mt-0.5 size-3.5 shrink-0 text-foreground/70" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-medium text-pretty text-foreground">
              {t("denied", { products: productLabel(denied) })}
            </p>
            <p className="text-[11px] leading-relaxed text-pretty text-muted-foreground">
              {t("deniedNote")}
            </p>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            loading={busy}
            onClick={() => onEnable(providerIds)}
          >
            {t("enable")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div role="note" className={cn(CARD_CLASS, className)}>
      <div className="flex gap-2.5">
        <KeyRound className="mt-0.5 size-3.5 shrink-0 text-foreground/70" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium text-pretty text-foreground">{t("title")}</p>
          <p className="text-[11px] leading-relaxed text-pretty text-muted-foreground">
            {t("note", { products: productLabel(pending) })}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onSkip(pending.map((item) => item.provider_id))}
        >
          {t("skip")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          loading={busy}
          onClick={() => onAllow(pending.map((item) => item.provider_id))}
        >
          {t("allow")}
        </Button>
      </div>
    </div>
  );
}
