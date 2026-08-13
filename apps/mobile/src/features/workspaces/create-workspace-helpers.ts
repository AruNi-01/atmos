import type { WorkspaceSetupProgressNotification, WsNotification } from "@/api/types";

/** ANSI CSI sequences for setup log preview. */
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;

export type SetupSnapshot = {
  progress: WorkspaceSetupProgressNotification;
  output: string;
};

export function isWsNotification(message: unknown): message is WsNotification {
  if (!message || typeof message !== "object") return false;
  const envelope = message as Record<string, unknown>;
  if (envelope.type !== "notification") return false;
  const payload = envelope.payload as Record<string, unknown> | undefined;
  return Boolean(payload && typeof payload.event === "string" && "data" in payload);
}

export function cleanSetupOutput(value: string) {
  return value.replace(ANSI_PATTERN, "").replace(/\r/g, "");
}

export function formatSetupStatus(progress: WorkspaceSetupProgressNotification) {
  if (progress.requires_confirmation) return "Waiting for confirmation";
  if (progress.status === "completed") return "Completed";
  if (progress.status === "error") return "Failed";
  if (progress.status === "setting_up") return "Running setup";
  return "Creating";
}

export function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `mobile-${Date.now()}`
  );
}
