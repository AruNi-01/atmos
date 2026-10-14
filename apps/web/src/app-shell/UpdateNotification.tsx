"use client";

import { useState, useEffect } from "react";
import { X, Download, ExternalLink, ArrowRight } from "lucide-react";
import { Button, cn } from "@workspace/ui";
import { isTauriRuntime } from "@/shared/lib/desktop-runtime";
import { useTranslations } from "next-intl";
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  getUpdateReleaseNotesUrl,
  type UpdateStatus,
  type UpdateInfo,
} from "@/features/settings/hooks/use-updater";

export default function UpdateNotification() {
  const t = useTranslations("appShell");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>({ stage: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    checkForUpdate((s) => {
      setStatus(s);
      if (s.stage === "available") {
        setUpdateInfo(s.info);
      }
    });
  }, []);

  const handleUpdate = async () => {
    await downloadAndInstallUpdate(setStatus);
  };

  if (dismissed || !updateInfo) return null;

  const isUpdating =
    status.stage === "downloading" || status.stage === "installing" || status.stage === "done";
  const releaseNotesUrl = getUpdateReleaseNotesUrl(updateInfo);

  return (
    <div
      className={cn(
        "fixed bottom-6 left-6 z-[100] w-[340px]",
        "rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg",
        "animate-in duration-300 fade-in slide-in-from-bottom-4",
      )}
    >
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <X className="size-4" />
      </button>

      <div className="mb-3">
        <h4 className="text-sm font-semibold">{t("updateNotification.title")}</h4>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          v{updateInfo.currentVersion}
          <ArrowRight className="size-3" />v{updateInfo.version}
        </p>
      </div>

      {status.stage === "error" && (
        <p className="mb-3 text-xs text-destructive">{status.message}</p>
      )}

      {updateInfo.manualDownloadOnly ? (
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            render={<a href={releaseNotesUrl} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLink className="size-3.5" />
            {t("updateNotification.openGitHub")}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            render={<a href={releaseNotesUrl} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLink className="size-3.5" />
            {t("updateNotification.whatsNew")}
          </Button>

          <Button
            size="sm"
            className="gap-1.5 text-xs"
            disabled={isUpdating}
            onClick={handleUpdate}
          >
            <Download className="size-3.5" />
            {status.stage === "downloading"
              ? t("updateNotification.action.downloading")
              : status.stage === "installing"
                ? t("updateNotification.action.installing")
                : status.stage === "done"
                  ? t("updateNotification.action.restarting")
                  : t("updateNotification.action.install")}
          </Button>
        </div>
      )}
    </div>
  );
}
