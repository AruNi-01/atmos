"use client";

import { useEffect, useRef, useState } from "react";
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
        title: "Preparing install…",
        description: "Starting the updater.",
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
          title: "Downloading update…",
          description: nextStatus.total
            ? `${Math.round((nextStatus.downloaded / nextStatus.total) * 100)}% downloaded`
            : "Downloading the latest version…",
          type: "loading",
          timeout: 0,
        });
        return;
      }

      if (nextStatus.stage === "installing") {
        toastManager.update(toastId, {
          title: "Installing update…",
          description: "Atmos will restart when installation finishes.",
          type: "loading",
          timeout: 0,
        });
        return;
      }

      if (nextStatus.stage === "upToDate") {
        installInFlightRef.current = false;
        toastManager.update(toastId, {
          title: "Already up to date",
          description: "No installable update is available.",
          type: "info",
          timeout: 4000,
        });
        return;
      }

      if (nextStatus.stage === "done") {
        installInFlightRef.current = false;
        toastManager.update(toastId, {
          title: "Restarting Atmos…",
          description: "The update has been installed.",
          type: "success",
          timeout: 2500,
        });
        return;
      }

      if (nextStatus.stage === "error") {
        installInFlightRef.current = false;
        toastManager.update(toastId, {
          title: "Update install failed",
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
      title: "Checking for updates…",
      description: "Querying the desktop updater.",
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
          title: "Update check failed",
          description: latestErrorMessage ?? "Unable to check for updates.",
          type: "error",
          timeout: 6000,
        });
        return;
      }

      if (latestStage === "available" && info) {
        toastManager.update(toastId, {
          title: `Version ${info.version} is available`,
          description: renderDesktopUpdateAvailableToast(info, () => {
            void handleInstallUpdate(toastId);
          }),
          type: "info",
          timeout: 0,
        });
        return;
      }

      toastManager.update(toastId, {
        title: "Already up to date",
        description: "You are already on the latest available version.",
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
      title: "Checking Atmos CLI…",
      description: "Querying the installed CLI and latest GitHub release.",
      type: "loading",
      timeout: 0,
    });

    try {
      const result = await systemApi.checkCliVersion();

      if (!result.installed) {
        toastManager.update(toastId, {
          title: "Atmos CLI not installed",
          description: "The local Atmos CLI was not found in ~/.atmos/bin.",
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
          title: `Atmos CLI ${result.latest_version} is available`,
          description: `Installed version: ${result.current_version ?? "unknown"}. Click Install to update.`,
          type: "info",
          timeout: 4000,
        });
        return;
      }

      toastManager.update(toastId, {
        title: "Atmos CLI is up to date",
        description: result.current_version
          ? `Installed version: ${result.current_version}.`
          : "No newer CLI release was found.",
        type: "success",
        timeout: 4000,
      });
    } catch (error) {
      toastManager.update(toastId, {
        title: "CLI version check failed",
        description: error instanceof Error ? error.message : "Unable to check Atmos CLI version.",
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
      title: "Installing Atmos CLI…",
      description: "Downloading and installing the latest version.",
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
        title: "Atmos CLI installed successfully",
        description: installResult.version
          ? `Updated to version ${installResult.version}.`
          : "CLI has been updated to the latest version.",
        type: "success",
        timeout: 4000,
      });
    } catch (error) {
      toastManager.update(toastId, {
        title: "CLI installation failed",
        description: error instanceof Error ? error.message : "Unable to install Atmos CLI.",
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
