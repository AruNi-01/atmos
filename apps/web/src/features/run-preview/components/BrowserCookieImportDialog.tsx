"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from "@workspace/ui";

import {
  extractCookieErrorCode,
  importBrowserCookies,
  listImportableBrowsers,
  type BrowserProfileDto,
  type CookieCmdErrorCode,
  type ImportReport,
} from "../lib/browser-cookie-commands";

interface BrowserCookieImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reload the active browser tab so imported cookies take effect (reload contract). */
  onReloadActiveTab?: () => void;
}

type DialogPhase = "idle" | "loading-profiles" | "importing" | "done" | "error";

/**
 * APP-040 · Atlas-style cookie import dialog (desktop, macOS 14+).
 *
 * Lets the user pick a source browser profile (opaque handle) and import its
 * cookies into the dedicated Atmos Browser store. On success it renders the
 * verified {@link ImportReport} inline and offers an explicit "Reload to apply"
 * CTA rather than silently reloading every surface. Errors are localized by the
 * stable `{ code }` returned by the command layer.
 */
export function BrowserCookieImportDialog({
  open,
  onOpenChange,
  onReloadActiveTab,
}: BrowserCookieImportDialogProps) {
  const t = useTranslations("preview.toolbar.cookieSync");
  const [phase, setPhase] = React.useState<DialogPhase>("idle");
  const [profiles, setProfiles] = React.useState<BrowserProfileDto[]>([]);
  const [selectedHandle, setSelectedHandle] = React.useState<string | null>(null);
  const [cookiesEnabled, setCookiesEnabled] = React.useState(true);
  const [report, setReport] = React.useState<ImportReport | null>(null);
  const [errorCode, setErrorCode] = React.useState<CookieCmdErrorCode | null>(null);

  const browserLabel = React.useCallback(
    (browser: string): string => {
      const known = new Set(["Chrome", "Edge", "Brave", "Firefox"]);
      return known.has(browser)
        ? t(`browsers.${browser}` as never)
        : t("browsers.unknown");
    },
    [t],
  );

  const selectedProfile = React.useMemo(
    () => profiles.find((profile) => profile.profile_handle === selectedHandle) ?? null,
    [profiles, selectedHandle],
  );

  // Load the profile list whenever the dialog opens; reset transient state on close.
  React.useEffect(() => {
    if (!open) {
      setPhase("idle");
      setReport(null);
      setErrorCode(null);
      return;
    }

    let cancelled = false;
    setPhase("loading-profiles");
    setReport(null);
    setErrorCode(null);

    listImportableBrowsers()
      .then((result) => {
        if (cancelled) return;
        setProfiles(result);
        setSelectedHandle((current) => {
          if (current && result.some((profile) => profile.profile_handle === current)) {
            return current;
          }
          return result[0]?.profile_handle ?? null;
        });
        setPhase("idle");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorCode(extractCookieErrorCode(error));
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const isImporting = phase === "importing";
  const canImport = Boolean(selectedHandle) && cookiesEnabled && !isImporting;

  const handleImport = React.useCallback(async () => {
    if (!selectedHandle || !cookiesEnabled) return;
    setPhase("importing");
    setReport(null);
    setErrorCode(null);
    try {
      const result = await importBrowserCookies(selectedHandle);
      setReport(result);
      setPhase("done");
    } catch (error: unknown) {
      setErrorCode(extractCookieErrorCode(error));
      setPhase("error");
    }
  }, [cookiesEnabled, selectedHandle]);

  const handleReload = React.useCallback(() => {
    onReloadActiveTab?.();
    onOpenChange(false);
  }, [onOpenChange, onReloadActiveTab]);

  const skippedRows: string[] = report
    ? [
        report.skipped_expired > 0
          ? t("import.result.skippedExpired", { count: report.skipped_expired })
          : null,
        report.skipped_decrypt > 0
          ? t("import.result.skippedDecrypt", { count: report.skipped_decrypt })
          : null,
        report.skipped_parse > 0
          ? t("import.result.skippedParse", { count: report.skipped_parse })
          : null,
        report.skipped_unsupported > 0
          ? t("import.result.skippedUnsupported", { count: report.skipped_unsupported })
          : null,
        report.failed_injection > 0
          ? t("import.result.failedInjection", { count: report.failed_injection })
          : null,
      ].filter((row): row is string => row !== null)
    : [];

  return (
    <Dialog open={open} onOpenChange={(next) => (isImporting ? undefined : onOpenChange(next))}>
      <DialogContent
        data-atmos-preview-overlay="true"
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => isImporting && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("import.title")}</DialogTitle>
          <DialogDescription>{t("import.description")}</DialogDescription>
        </DialogHeader>

        {phase === "done" && report ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {report.imported_verified > 0
                    ? t("import.result.verified", { count: report.imported_verified })
                    : t("import.result.noneImported")}
                </p>
                {skippedRows.length > 0 ? (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {skippedRows.map((row) => (
                      <li key={row}>{row}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
            {report.imported_verified > 0 ? (
              <p className="text-xs text-muted-foreground">{t("import.result.reloadHint")}</p>
            ) : null}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                {t("import.result.done")}
              </Button>
              {report.imported_verified > 0 ? (
                <Button size="sm" onClick={handleReload}>
                  {t("import.result.reload")}
                </Button>
              ) : null}
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">{t("import.fromLabel")}</label>
              <Select
                value={selectedHandle ?? undefined}
                onValueChange={setSelectedHandle}
                disabled={isImporting || phase === "loading-profiles" || profiles.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      phase === "loading-profiles"
                        ? t("import.loading")
                        : profiles.length === 0
                          ? t("import.noBrowsers")
                          : t("import.profilePlaceholder")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.profile_handle} value={profile.profile_handle}>
                      {browserLabel(profile.browser)}
                      {profile.display_name ? ` · ${profile.display_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProfile?.running ? (
                <p className="text-xs text-muted-foreground">
                  {t("import.runningHint", { browser: browserLabel(selectedProfile.browser) })}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">{t("import.cookiesToggleLabel")}</p>
                <p className="text-xs text-muted-foreground">{t("import.cookiesToggleHint")}</p>
              </div>
              <Switch
                checked={cookiesEnabled}
                onCheckedChange={setCookiesEnabled}
                disabled={isImporting}
                aria-label={t("import.cookiesToggleLabel")}
              />
            </div>

            {phase === "error" && errorCode ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p className="text-xs leading-relaxed text-foreground">
                  {t(`errors.${errorCode}` as never)}
                </p>
              </div>
            ) : null}

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isImporting}
              >
                {t("import.cancel")}
              </Button>
              <Button size="sm" onClick={() => void handleImport()} disabled={!canImport}>
                {isImporting ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className={cn("size-3.5 animate-spin")} />
                    {t("import.importing")}
                  </span>
                ) : (
                  t("import.import")
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
