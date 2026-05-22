"use client";

import { useCallback, useEffect, useState } from "react";
import { toastManager } from "@workspace/ui";
import { fetchExtensionDownload, fetchExtensionVersion } from "@/api/preview";
import { readExtVersionCheckTs, writeExtVersionCheckTs } from "@/hooks/use-ui-pref-hooks";
import type { PreviewTransportMode } from "./preview-bridge/types";

interface UsePreviewExtensionDownloadsArgs {
  extensionVersionRef: React.RefObject<string | null>;
  preferredTransportMode: PreviewTransportMode | "unavailable";
  transportConnected: boolean;
  transportMode: PreviewTransportMode | "unavailable";
}

async function downloadExtensionPackage() {
  const blob = await fetchExtensionDownload();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = "atmos-inspector-extension.zip";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1_000);
}

export function usePreviewExtensionDownloads({
  extensionVersionRef,
  preferredTransportMode,
  transportConnected,
  transportMode,
}: UsePreviewExtensionDownloadsArgs) {
  const [extensionPopoverOpen, setExtensionPopoverOpen] = useState(false);
  const [extensionDownloadStarted, setExtensionDownloadStarted] = useState(false);
  const [isDownloadingExtension, setIsDownloadingExtension] = useState(false);
  const [isRecheckingExtension, setIsRecheckingExtension] = useState(false);
  const [extensionUpdateAvailable, setExtensionUpdateAvailable] = useState(false);
  const [extensionUpdatePopoverOpen, setExtensionUpdatePopoverOpen] = useState(false);

  useEffect(() => {
    if (!extensionPopoverOpen) {
      setExtensionDownloadStarted(false);
      setIsDownloadingExtension(false);
      setIsRecheckingExtension(false);
    }
  }, [extensionPopoverOpen]);

  useEffect(() => {
    if (transportMode !== "extension" || transportConnected) {
      setExtensionDownloadStarted(false);
      setIsDownloadingExtension(false);
      setIsRecheckingExtension(false);
      setExtensionPopoverOpen(false);
    }
  }, [transportConnected, transportMode]);

  const checkExtensionUpdate = useCallback(async () => {
    if (preferredTransportMode !== "extension") return;
    const installedVersion = extensionVersionRef.current;
    if (!installedVersion) return;

    try {
      const lastCheck = readExtVersionCheckTs();
      if (Date.now() - lastCheck < 86_400_000) return;

      writeExtVersionCheckTs(Date.now());
      const latestVersion = await fetchExtensionVersion();
      setExtensionUpdateAvailable(latestVersion !== installedVersion);
    } catch {
      // Silently ignore version check failures
    }
  }, [extensionVersionRef, preferredTransportMode]);

  const handleDownloadExtensionUpdate = useCallback(async () => {
    if (typeof window === "undefined" || isDownloadingExtension) return;
    setIsDownloadingExtension(true);
    try {
      await downloadExtensionPackage();
      setExtensionUpdateAvailable(false);
      setExtensionUpdatePopoverOpen(false);
      toastManager.add({
        type: "success",
        title: "Extension update downloaded",
        description: "Replace the old extension folder with the new one and reload.",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to download extension",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsDownloadingExtension(false);
    }
  }, [isDownloadingExtension]);

  const handleDownloadExtension = useCallback(async () => {
    if (typeof window === "undefined" || isDownloadingExtension) return;

    setIsDownloadingExtension(true);

    try {
      await downloadExtensionPackage();
      setExtensionDownloadStarted(true);
      toastManager.add({
        type: "success",
        title: "Extension package downloaded",
        description: "Unzip atmos-inspector-extension.zip, then load the extracted folder in Chrome or Edge.",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to download extension",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsDownloadingExtension(false);
    }
  }, [isDownloadingExtension]);

  return {
    checkExtensionUpdate,
    extensionDownloadStarted,
    extensionPopoverOpen,
    extensionUpdateAvailable,
    extensionUpdatePopoverOpen,
    handleDownloadExtension,
    handleDownloadExtensionUpdate,
    isDownloadingExtension,
    isRecheckingExtension,
    setExtensionPopoverOpen,
    setExtensionUpdatePopoverOpen,
    setIsRecheckingExtension,
  };
}
