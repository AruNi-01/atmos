"use client";

/**
 * Mount once near app root so gateDesktopUseFeature() can open a modal
 * from AppShot / slash / any entry without prop drilling.
 */
import { DesktopUseReadinessDialog } from "./DesktopUseReadinessDialog";

export function DesktopUseReadinessHost() {
  return <DesktopUseReadinessDialog />;
}
