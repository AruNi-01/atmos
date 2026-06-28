"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toastManager } from "@workspace/ui";
import { systemApi } from "@/api/rest-api";
import { isTauriRuntime } from "@/shared/lib/desktop-runtime";
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  type UpdateStatus,
} from "@/features/settings/hooks/use-updater";
import { renderDesktopUpdateAvailableToast } from "@/features/settings/components/SettingsAboutSection";

export function useSettingsUpdateActions() {
  const t = useTranslations("settings.updateActions");
  const installInFlightRef = useRef(false);
  const [status, setStatus] = useState<UpdateStatus>({ stage: "idle" });
  const [isCheckingCliVersion, setIsCheckingCliVersion] = useState(false);
  const [isCheckingDesktopUpdate, setIsCheckingDesktopUpdate] = useState(false);
  const [isInstallingCli, setIsInstallingCli] = useState(false);
  const [cliVersionInfo, setCliVersionInfo] = useState<{
    current: string | null;
    latest: string | null;
    updateAvailable: boolean;
  } | null>(null);
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    if (!isTauriRuntime()) return;
    import("@tauri-apps/api/app").then(({ getVersion }) =>
      getVersion().then(setAppVersion)
    ).catch(() => {});
  }, []);

  const handleInstallUpdate = async (toastId?: string) => {
    if (installInFlightRef.current) {
      return;
    }
    installInFlightRef.current = true;

    if (toastId) {
      toastManager.update(toastId, {
        title: t("install.preparingTitle"),
        description: t("install.preparingDescription"),
        type: "loading",
        timeout: 0,
      });
    }

    await downloadAndInstallUpdate((nextStatus) => {
      setStatus(nextStatus);

      if (!toastId) {
        return;
      }

      if (nextStatus.stage === "downloading") {
        toastManager.update(toastId, {
          title: t("install.downloadingTitle"),
          description: nextStatus.total
            ? t("install.downloadingProgress", {
                progress: Math.round((nextStatus.downloaded / nextStatus.total) * 100),
              })
            : t("install.downloadingDescription"),
          type: "loading",
          timeout: 0,
        });
        return;
      }

      if (nextStatus.stage === "installing") {
        toastManager.update(toastId, {
          title: t("install.installingTitle"),
          description: t("install.installingDescription"),
          type: "loading",
          timeout: 0,
        });
        return;
      }

      if (nextStatus.stage === "upToDate") {
        installInFlightRef.current = false;
        toastManager.update(toastId, {
          title: t("install.upToDateTitle"),
          description: t("install.upToDateDescription"),
          type: "info",
          timeout: 4000,
        });
        return;
      }

      if (nextStatus.stage === "done") {
        installInFlightRef.current = false;
        toastManager.update(toastId, {
          title: t("install.restartingTitle"),
          description: t("install.restartingDescription"),
          type: "success",
          timeout: 2500,
        });
        return;
      }

      if (nextStatus.stage === "error") {
        installInFlightRef.current = false;
        toastManager.update(toastId, {
          title: t("install.failedTitle"),
          description: nextStatus.message,
          type: "error",
          timeout: 6000,
        });
      }
    });
  };

  const handleCheckForUpdate = async () => {
    if (isCheckingDesktopUpdate) {
      return;
    }

    setIsCheckingDesktopUpdate(true);
    let latestStage = "idle";
    let latestErrorMessage: string | undefined;
    const toastId = toastManager.add({
      title: t("desktop.checkingTitle"),
      description: t("desktop.checkingDescription"),
      type: "loading",
      timeout: 0,
    });

    try {
      const info = await checkForUpdate((nextStatus) => {
        latestStage = nextStatus.stage;
        latestErrorMessage = nextStatus.stage === "error" ? nextStatus.message : undefined;
        setStatus(nextStatus);
      });

      if (latestStage === "error") {
        toastManager.update(toastId, {
          title: t("desktop.checkFailedTitle"),
          description: latestErrorMessage ?? t("desktop.checkFailedDescription"),
          type: "error",
          timeout: 6000,
        });
        return;
      }

      if (latestStage === "available" && info) {
        toastManager.update(toastId, {
          title: t("desktop.availableTitle", { version: info.version }),
          description: renderDesktopUpdateAvailableToast(
            info,
            {
              manualDescription: t("desktop.toast.manualDescription"),
              automaticDescription: t("desktop.toast.automaticDescription"),
              openGitHub: t("desktop.toast.openGitHub"),
              whatsNew: t("desktop.toast.whatsNew"),
              install: t("desktop.toast.install"),
            },
            () => {
            void handleInstallUpdate(toastId);
            },
          ),
          type: "info",
          timeout: 0,
        });
        return;
      }

      toastManager.update(toastId, {
        title: t("desktop.upToDateTitle"),
        description: t("desktop.upToDateDescription"),
        type: "success",
        timeout: 4000,
      });
    } finally {
      setIsCheckingDesktopUpdate(false);
    }
  };

  const handleCheckCliVersion = async () => {
    setIsCheckingCliVersion(true);
    const toastId = toastManager.add({
      title: t("cli.checkingTitle"),
      description: t("cli.checkingDescription"),
      type: "loading",
      timeout: 0,
    });

    try {
      const result = await systemApi.checkCliVersion();

      if (!result.installed) {
        toastManager.update(toastId, {
          title: t("cli.notInstalledTitle"),
          description: t("cli.notInstalledDescription"),
          type: "error",
          timeout: 6000,
        });
        setCliVersionInfo(null);
        return;
      }

      setCliVersionInfo({
        current: result.current_version,
        latest: result.latest_version,
        updateAvailable: result.update_available,
      });

      if (result.update_available) {
        toastManager.update(toastId, {
          title: t("cli.availableTitle", { version: result.latest_version ?? "" }),
          description: t("cli.availableDescription", {
            current: result.current_version ?? t("cli.unknownVersion"),
          }),
          type: "info",
          timeout: 4000,
        });
        return;
      }

      toastManager.update(toastId, {
        title: t("cli.upToDateTitle"),
        description: result.current_version
          ? t("cli.installedVersion", { current: result.current_version })
          : t("cli.noNewerRelease"),
        type: "success",
        timeout: 4000,
      });
    } catch (error) {
      toastManager.update(toastId, {
        title: t("cli.checkFailedTitle"),
        description: error instanceof Error ? error.message : t("cli.checkFailedDescription"),
        type: "error",
        timeout: 6000,
      });
    } finally {
      setIsCheckingCliVersion(false);
    }
  };

  const handleInstallCli = async () => {
    setIsInstallingCli(true);
    const toastId = toastManager.add({
      title: t("cli.installingTitle"),
      description: t("cli.installingDescription"),
      type: "loading",
      timeout: 0,
    });

    try {
      const installResult = await systemApi.installCli(false);
      const versionResult = await systemApi.checkCliVersion();
      setCliVersionInfo({
        current: versionResult.current_version,
        latest: versionResult.latest_version,
        updateAvailable: versionResult.update_available,
      });

      toastManager.update(toastId, {
        title: t("cli.installSuccessTitle"),
        description: installResult.version
          ? t("cli.installSuccessVersion", { version: installResult.version })
          : t("cli.installSuccessDescription"),
        type: "success",
        timeout: 4000,
      });
    } catch (error) {
      toastManager.update(toastId, {
        title: t("cli.installFailedTitle"),
        description: error instanceof Error ? error.message : t("cli.installFailedDescription"),
        type: "error",
        timeout: 6000,
      });
    } finally {
      setIsInstallingCli(false);
    }
  };

  return {
    appVersion,
    cliVersionInfo,
    handleCheckCliVersion,
    handleCheckForUpdate,
    handleInstallCli,
    isCheckingCliVersion,
    isCheckingDesktopUpdate,
    isInstallingCli,
    status,
  };
}
