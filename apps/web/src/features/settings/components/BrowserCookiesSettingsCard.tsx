"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Cookie } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui";
import {
  SettingsGroupCard,
  SettingsGroupRow,
} from "@/features/settings/components/settings/SettingsGroupCard";
import { BrowserCookieImportDialog } from "@/features/browser/components/BrowserCookieImportDialog";
import {
  clearBrowserCache,
  clearBrowserSiteData,
  extractCookieErrorCode,
  type CookieCmdErrorCode,
} from "@/features/browser/lib/browser-cookie-commands";
import { isDesktopRuntime } from "@/shared/lib/desktop-runtime";

type ClearTarget = "cache" | "site";
type ClearPhase = "confirm" | "clearing" | "cleared" | "error";

function cookieToolsAvailable() {
  return (
    isDesktopRuntime() &&
    typeof navigator !== "undefined" &&
    /Mac/i.test(navigator.userAgent)
  );
}

export function BrowserCookiesSettingsCard() {
  const t = useTranslations("settings.browser");
  const cookieT = useTranslations("browser.toolbar.cookieSync");
  const [open, setOpen] = React.useState(true);
  const [importOpen, setImportOpen] = React.useState(false);
  const [clearTarget, setClearTarget] = React.useState<ClearTarget | null>(null);
  const [clearPhase, setClearPhase] = React.useState<ClearPhase>("confirm");
  const [clearErrorCode, setClearErrorCode] = React.useState<CookieCmdErrorCode | null>(null);
  const [available, setAvailable] = React.useState(false);

  React.useEffect(() => {
    setAvailable(cookieToolsAvailable());
  }, []);

  const closeClear = () => {
    setClearTarget(null);
    setClearPhase("confirm");
    setClearErrorCode(null);
  };

  const runClear = async () => {
    if (!clearTarget) return;
    setClearPhase("clearing");
    setClearErrorCode(null);
    try {
      if (clearTarget === "cache") {
        await clearBrowserCache();
      } else {
        await clearBrowserSiteData();
      }
      setClearPhase("cleared");
    } catch (error: unknown) {
      setClearErrorCode(extractCookieErrorCode(error));
      setClearPhase("error");
    }
  };

  const isSiteData = clearTarget === "site";
  const clearing = clearPhase === "clearing";

  return (
    <>
      <SettingsGroupCard
        open={open}
        onOpenChange={setOpen}
        icon={Cookie}
        title={t("groups.cookies.title")}
        description={t("groups.cookies.description")}
      >
        {available ? (
          <>
            <SettingsGroupRow
              title={t("cookies.import.title")}
              description={t("cookies.import.description")}
              wide
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
              >
                {t("cookies.import.action")}
              </Button>
            </SettingsGroupRow>
            <SettingsGroupRow
              title={t("cookies.clearCache.title")}
              description={t("cookies.clearCache.description")}
              wide
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setClearPhase("confirm");
                  setClearErrorCode(null);
                  setClearTarget("cache");
                }}
              >
                {t("cookies.clearCache.action")}
              </Button>
            </SettingsGroupRow>
            <SettingsGroupRow
              title={t("cookies.clearSiteData.title")}
              description={t("cookies.clearSiteData.description")}
              wide
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setClearPhase("confirm");
                  setClearErrorCode(null);
                  setClearTarget("site");
                }}
              >
                {t("cookies.clearSiteData.action")}
              </Button>
            </SettingsGroupRow>
          </>
        ) : (
          <div className="px-2 py-4 text-sm text-muted-foreground">
            {t("cookies.unavailable")}
          </div>
        )}
      </SettingsGroupCard>

      <BrowserCookieImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <Dialog
        open={clearTarget !== null}
        onOpenChange={(next) => {
          if (!next && !clearing) closeClear();
        }}
      >
        <DialogContent className="sm:max-w-md">
          {clearPhase === "cleared" ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {isSiteData
                    ? cookieT("clear.clearedSiteData")
                    : cookieT("clear.clearedCache")}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {isSiteData
                    ? cookieT("clear.clearedSiteData")
                    : cookieT("clear.clearedCache")}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={closeClear}>
                  {cookieT("clear.done")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {isSiteData
                    ? cookieT("clear.siteDataTitle")
                    : cookieT("clear.cacheTitle")}
                </DialogTitle>
                <DialogDescription>
                  {isSiteData
                    ? cookieT("clear.siteDataDescription")
                    : cookieT("clear.cacheDescription")}
                </DialogDescription>
              </DialogHeader>
              {clearPhase === "error" && clearErrorCode ? (
                <p className="text-sm text-destructive">
                  {cookieT(`errors.${clearErrorCode}` as never)}
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={closeClear}
                  disabled={clearing}
                >
                  {cookieT("clear.cancel")}
                </Button>
                <Button
                  variant={isSiteData ? "destructive" : "default"}
                  size="sm"
                  onClick={() => void runClear()}
                  disabled={clearing}
                >
                  {clearing
                    ? cookieT("clear.clearing")
                    : clearPhase === "error"
                      ? cookieT("clear.retry")
                      : isSiteData
                        ? cookieT("clear.confirmSiteData")
                        : cookieT("clear.confirmCache")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}