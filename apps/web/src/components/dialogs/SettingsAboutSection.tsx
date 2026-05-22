"use client";

import React from "react";
import { Button } from "@workspace/ui";
import { Download, ExternalLink, LoaderCircle, RotateCcw } from "lucide-react";

import { AtmosWordmark } from "@/components/ui/AtmosWordmark";
import { getUpdateReleaseNotesUrl, type UpdateStatus } from "@/hooks/use-updater";
import { isTauriRuntime } from "@/lib/desktop-runtime";

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
            <p className="text-base font-medium text-foreground">Runtime</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Current environment that is rendering this settings panel.
            </p>
          </div>
          <div className="flex items-center text-sm font-medium text-foreground">
            {isTauriRuntime() ? "Desktop" : "Web"}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-b border-border px-6 py-5">
          <div>
            <p className="text-base font-medium text-foreground">Version</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Current app version reported by the desktop runtime.
            </p>
          </div>
          <div className="flex items-center text-sm font-medium text-foreground">
            {appVersion || "Unavailable"}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-b border-border px-6 py-5">
          <div>
            <p className="text-base font-medium text-foreground">Atmos CLI</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Check for the latest CLI updates.
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
                Install Update
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
                Check for Updates
              </Button>
            )}
          </div>
        </div>

        {isTauriRuntime() && (
          <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
            <div>
              <p className="text-base font-medium text-foreground">Check for updates</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Query the desktop updater for the latest available release.
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
                Check for Updates
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function renderDesktopUpdateAvailableToast(
  info: Parameters<typeof getUpdateReleaseNotesUrl>[0],
  onInstall: () => void,
) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        A newer desktop version is ready to install.
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <a
            href={getUpdateReleaseNotesUrl(info)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="mr-1.5 size-3.5" />
            What&apos;s New
          </a>
        </Button>
        <Button size="sm" onClick={onInstall}>
          <Download className="mr-1.5 size-3.5" />
          Install
        </Button>
      </div>
    </div>
  );
}
