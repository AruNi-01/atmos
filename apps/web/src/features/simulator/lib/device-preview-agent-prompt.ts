import { wrapAiContextClipboard } from "@/shared/lib/ai-context-protocol";
import type { SimulatorClaimListItem } from "@atmos/api-types/ws/dto/simulator";

export const DEVICE_PREVIEW_SLASH_COMMAND_ID = "device-preview";

export type DevicePreviewClaimInput = Pick<
  SimulatorClaimListItem,
  | "udid"
  | "name"
  | "platform"
  | "workspace_id"
  | "workspace_name"
  | "project_id"
  | "project_name"
  | "current"
>;

export function formatDevicePreviewPrompt(claim: DevicePreviewClaimInput): string {
  return [
    "Drive the Atmos Device Preview for this claimed simulator.",
    "Load skill atmos-device-preview. Use `atmos simulator` and pass --udid on every command.",
    "Do not use Desktop Use or Browser Use for this phone. Do not curl helper ports.",
    "",
    "Device",
    `- udid: ${claim.udid}`,
    `- name: ${claim.name}`,
    `- platform: ${claim.platform}`,
    "",
    "Owned by",
    `- project: ${claim.project_name} (id: ${claim.project_id})`,
    `- workspace: ${claim.workspace_name} (id: ${claim.workspace_id})`,
    "",
    "This claim belongs to that workspace. Do not operate a different workspace's device.",
  ].join("\n");
}

export function formatDevicePreviewListPrompt(
  claims: readonly DevicePreviewClaimInput[],
): string {
  const catalog = claims.map(
    (claim) =>
      `- ${claim.name} · ${claim.platform} · ${claim.project_name} · ${claim.workspace_name}`,
  );
  const body =
    claims.length === 0
      ? [
          "Atmos Device Preview has no live claims on this Computer.",
          "",
          "Ask the user to Start the Simulator tab, click Agent, or run /device-preview. Do not auto-start Device Preview.",
        ]
      : [
          "Atmos Device Preview has live claims, but none is bound for this composer workspace.",
          "",
          "Live claims",
          ...catalog,
          "",
          "Ask the user which udid to use. Do not guess. Do not auto-start Device Preview. Do not operate a different workspace's device unless the user names that udid.",
        ];
  return [
    ...body,
    "",
    "Load skill atmos-device-preview. Use `atmos simulator` and pass --udid on every command.",
    "Do not use Desktop Use or Browser Use for this phone. Do not curl helper ports.",
  ].join("\n");
}

export function formatDevicePreviewClipboard(prompt: string): string {
  return wrapAiContextClipboard("device-preview", prompt);
}

export function pickDevicePreviewClaim(
  claims: readonly DevicePreviewClaimInput[],
  workspaceId?: string | null,
): DevicePreviewClaimInput | null {
  if (!workspaceId) return null;
  const matching = claims.filter((claim) => claim.workspace_id === workspaceId);
  return matching.find((claim) => claim.current) ?? matching[0] ?? null;
}

export function resolveDevicePreviewPromptFromClaims(
  claims: readonly DevicePreviewClaimInput[],
  workspaceId?: string | null,
): string {
  const claim = pickDevicePreviewClaim(claims, workspaceId);
  if (claim) return formatDevicePreviewPrompt(claim);
  return formatDevicePreviewListPrompt(claims);
}

export async function loadDevicePreviewPrompt(
  workspaceId?: string | null,
): Promise<string> {
  try {
    const { simulatorApi } = await import("@/api/ws/simulator-api");
    const list = await simulatorApi.list(workspaceId);
    return resolveDevicePreviewPromptFromClaims(list.devices, workspaceId);
  } catch {
    return formatDevicePreviewListPrompt([]);
  }
}

export function matchesDevicePreviewSlashQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    "device-preview".includes(q) ||
    "device preview".includes(q) ||
    "atmos-device-preview".includes(q) ||
    "atmos device preview".includes(q) ||
    "simulator".includes(q) ||
    "emulator".includes(q) ||
    "phone".includes(q) ||
    "udid".includes(q)
  );
}

export function buildDevicePreviewSlashCommand(opts: {
  label: string;
  description: string;
}): { id: string; label: string; description: string } {
  return {
    id: DEVICE_PREVIEW_SLASH_COMMAND_ID,
    label: opts.label,
    description: opts.description,
  };
}
