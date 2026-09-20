"use client";

import React from "react";
import { Smartphone } from "lucide-react";
import { useSimulatorRuntimeStore } from "../store/use-simulator-runtime-store";
import type { SimulatorDevicePlatform } from "../types";

function IosMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M16.365 12.84c.02 2.99 2.62 3.99 2.65 4-.03.1-.41 1.4-1.36 2.77-.82 1.19-1.68 2.37-3.03 2.4-1.32.03-1.75-.78-3.26-.78-1.52 0-1.99.76-3.25.81-1.3.05-2.29-1.29-3.12-2.47C3.2 17.4 1.86 12.7 3.64 9.55c.86-1.53 2.4-2.5 4.08-2.53 1.27-.02 2.47.86 3.26.86.78 0 2.24-1.07 3.78-.91.64.03 2.45.26 3.61 1.97-.09.06-2.15 1.26-2.12 3.9M13.5 4.4c.72-.87 1.2-2.07 1.07-3.28-1.03.04-2.28.69-3.02 1.56-.66.77-1.24 2.01-1.08 3.19 1.14.09 2.32-.58 3.03-1.47" />
    </svg>
  );
}

function AndroidMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M17.6 9.48 19.44 6.3a.64.64 0 0 0-.22-.88.64.64 0 0 0-.88.22l-1.88 3.24a11.43 11.43 0 0 0-8.92 0L5.66 5.64a.64.64 0 1 0-1.1.66l1.84 3.18C4.17 11.31 2.78 14.29 2.5 17.67h19c-.27-3.38-1.66-6.36-3.9-8.19M7.5 14.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2m9 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2" />
    </svg>
  );
}

export function SimulatorPlatformIcon({
  platform,
  className,
}: {
  platform?: SimulatorDevicePlatform | null;
  className?: string;
}) {
  if (platform === "ios") return <IosMark className={className} />;
  if (platform === "android") return <AndroidMark className={className} />;
  return <Smartphone className={className} />;
}

export function SimulatorTabIcon({
  className,
  contextId,
}: {
  className?: string;
  contextId?: string | null;
}) {
  const platform = useSimulatorRuntimeStore((store) =>
    contextId ? store.platformByWorkspace[contextId] : undefined,
  );
  return <SimulatorPlatformIcon platform={platform} className={className} />;
}
