"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@workspace/ui";
import { Download, ExternalLink, LoaderCircle, RotateCcw } from "lucide-react";

import { AtmosWordmark } from "@/shared/components/ui/AtmosWordmark";
import {
  getUpdateReleaseNotesUrl,
  type UpdateInfo,
  type UpdateStatus,
} from "@/features/settings/hooks/use-updater";
import { isDesktopRuntime, isTauriRuntime } from "@/shared/lib/desktop-runtime";

interface SettingsAboutSectionProps {
  appVersion: string;
  cliVersionInfo: {
    current: string | null;
    latest: string | null;
    updateAvailable: boolean;
  } | null;
  isInstallingCli: boolean;
  isCheckingCliVersion: boolean;
  isCheckingDesktopUpdate: boolean;
  status: UpdateStatus;
  onInstallCli: () => void;
  onCheckCliVersion: () => void;
  onCheckForUpdate: () => void;
}

export function SettingsAboutSection({
  appVersion,
  cliVersionInfo,
  isInstallingCli,
  isCheckingCliVersion,
  isCheckingDesktopUpdate,
  status,
  onInstallCli,
  onCheckCliVersion,
  onCheckForUpdate,
}: SettingsAboutSectionProps) {
  const t = useTranslations("settings.aboutSection");
  const isChecking = status.stage === "checking";
  const isDownloading = status.stage === "downloading";
  const isInstalling = status.stage === "installing";

  return (
    <>
      <div className="mb-10 mt-4">
        <AtmosWordmark className="w-full" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-b border-border px-6 py-5">
          <div>
            <p className="text-base font-medium text-foreground">{t("runtime.title")}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("runtime.description")}
            </p>
          </div>
          <div className="flex items-center text-sm font-medium text-foreground">
            {isDesktopRuntime() ? t("runtime.desktop") : t("runtime.web")}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-b border-border px-6 py-5">
          <div>
            <p className="text-base font-medium text-foreground">{t("version.title")}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("version.description")}
            </p>
          </div>
          <div className="flex items-center text-sm font-medium text-foreground">
            {appVersion || t("version.unavailable")}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-b border-border px-6 py-5">
          <div>
            <p className="text-base font-medium text-foreground">{t("cli.title")}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("cli.description")}
            </p>
          </div>
          <div className="flex items-center">
            {cliVersionInfo?.updateAvailable ? (
              <Button
                onClick={onInstallCli}
                disabled={isInstallingCli}
                className="cursor-pointer"
              >
                {isInstallingCli ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin-reverse" />
                ) : (
                  <Download className="mr-2 size-4" />
                )}
                {t("cli.installUpdate")}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={onCheckCliVersion}
                disabled={isCheckingCliVersion}
                className="cursor-pointer"
              >
                {isCheckingCliVersion ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin-reverse" />
                ) : (
                  <RotateCcw className="mr-2 size-4" />
                )}
                {t("cli.checkForUpdates")}
              </Button>
            )}
          </div>
        </div>

        {isTauriRuntime() && (
          <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
            <div>
              <p className="text-base font-medium text-foreground">{t("desktop.title")}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("desktop.description")}
              </p>
            </div>
            <div className="flex items-center">
              <Button
                variant="outline"
                onClick={onCheckForUpdate}
                disabled={isCheckingDesktopUpdate || isChecking || isDownloading || isInstalling}
                className="cursor-pointer"
              >
                {isCheckingDesktopUpdate ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin-reverse" />
                ) : (
                  <RotateCcw className="mr-2 size-4" />
                )}
                {t("desktop.checkForUpdates")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function renderDesktopUpdateAvailableToast(
  info: UpdateInfo,
  copy: {
    manualDescription: string;
    automaticDescription: string;
    openGitHub: string;
    whatsNew: string;
    install: string;
  },
  onInstall?: () => void,
) {
  if (info.manualDownloadOnly) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {copy.manualDescription}
        </p>
        <Button
          size="sm"
          render={
            <a
              href={getUpdateReleaseNotesUrl(info)}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          <ExternalLink className="mr-1.5 size-3.5" />
          {copy.openGitHub}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {copy.automaticDescription}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          render={
            <a
              href={getUpdateReleaseNotesUrl(info)}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          <ExternalLink className="mr-1.5 size-3.5" />
          {copy.whatsNew}
        </Button>
        <Button size="sm" onClick={onInstall}>
          <Download className="mr-1.5 size-3.5" />
          {copy.install}
        </Button>
      </div>
    </div>
  );
}
