import { wrapAiContextClipboard } from "@/shared/lib/ai-context-protocol";
import type { SimulatorClaimListItem } from "@atmos/api-types/ws/dto/simulator";

export const DEVICE_PREVIEW_SLASH_COMMAND_ID = "device-preview";
export const DEVICE_PREVIEW_SKILL_NAME = "atmos-device-preview";
/** Installed by system skill sync, not the agent-host skill folder. */
export const DEVICE_PREVIEW_SKILL_PATH =
  "~/.atmos/skills/.system/atmos-device-preview/SKILL.md";

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

function nonempty(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function skillInstruction(skillPath: string): string {
  return `Read ${skillPath} and follow it. Use \`atmos simulator\` and pass --udid on every command.`;
}

export function devicePreviewSkillMdPath(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, "");
  if (!trimmed) return DEVICE_PREVIEW_SKILL_PATH;
  if (trimmed.endsWith("SKILL.md")) return trimmed;
  return `${trimmed}/SKILL.md`;
}

function formatOwnerLine(kind: "project" | "workspace", name: string, id: string): string {
  if (name && id) return `- ${kind}: ${name} (id: ${id})`;
  if (name) return `- ${kind}: ${name}`;
  return `- ${kind}: ${id}`;
}

/** Prefer project when it has a name or id; otherwise workspace. Skip empty fields. */
export function pickDevicePreviewOwner(
  claim: DevicePreviewClaimInput,
): { kind: "project" | "workspace"; line: string } | null {
  const projectName = nonempty(claim.project_name);
  const projectId = nonempty(claim.project_id);
  if (projectName || projectId) {
    return { kind: "project", line: formatOwnerLine("project", projectName, projectId) };
  }
  const workspaceName = nonempty(claim.workspace_name);
  const workspaceId = nonempty(claim.workspace_id);
  if (workspaceName || workspaceId) {
    return {
      kind: "workspace",
      line: formatOwnerLine("workspace", workspaceName, workspaceId),
    };
  }
  return null;
}

function ownerCatalogLabel(claim: DevicePreviewClaimInput): string {
  return (
    nonempty(claim.project_name) ||
    nonempty(claim.project_id) ||
    nonempty(claim.workspace_name) ||
    nonempty(claim.workspace_id)
  );
}

export function formatDevicePreviewPrompt(
  claim: DevicePreviewClaimInput,
  skillPath: string = DEVICE_PREVIEW_SKILL_PATH,
): string {
  const owner = pickDevicePreviewOwner(claim);
  const lines = [
    "Drive the Atmos Device Preview for this claimed simulator.",
    skillInstruction(skillPath),
    "Do not use Desktop Use or Browser Use for this phone. Do not curl helper ports.",
    "",
    "Device",
    `- udid: ${claim.udid}`,
    `- name: ${claim.name}`,
    `- platform: ${claim.platform}`,
  ];
  if (owner) {
    lines.push(
      "",
      "Owned by",
      owner.line,
      "",
      owner.kind === "project"
        ? "This claim belongs to that project. Do not operate a different project's device."
        : "This claim belongs to that workspace. Do not operate a different workspace's device.",
    );
  }
  return lines.join("\n");
}

export function formatDevicePreviewListPrompt(
  claims: readonly DevicePreviewClaimInput[],
  skillPath: string = DEVICE_PREVIEW_SKILL_PATH,
): string {
  const catalog = claims.map((claim) => {
    const owner = ownerCatalogLabel(claim);
    return owner
      ? `- ${claim.name} · ${claim.platform} · ${owner}`
      : `- ${claim.name} · ${claim.platform}`;
  });
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
    skillInstruction(skillPath),
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
  skillPath: string = DEVICE_PREVIEW_SKILL_PATH,
): string {
  const claim = pickDevicePreviewClaim(claims, workspaceId);
  if (claim) return formatDevicePreviewPrompt(claim, skillPath);
  return formatDevicePreviewListPrompt(claims, skillPath);
}

export async function resolveDevicePreviewSkillPath(): Promise<string> {
  try {
    const { skillsApi } = await import("@/api/ws/skills-api");
    const { skills } = await skillsApi.list();
    const found = skills.find(
      (skill) =>
        skill.name === DEVICE_PREVIEW_SKILL_NAME ||
        skill.id === DEVICE_PREVIEW_SKILL_NAME ||
        skill.path.includes("atmos-device-preview"),
    );
    if (found?.path) return devicePreviewSkillMdPath(found.path);
  } catch {
    // Clipboard still works with the synced ~/.atmos path.
  }
  return DEVICE_PREVIEW_SKILL_PATH;
}

export async function loadDevicePreviewPrompt(
  workspaceId?: string | null,
): Promise<string> {
  const skillPath = await resolveDevicePreviewSkillPath();
  try {
    const { simulatorApi } = await import("@/api/ws/simulator-api");
    const list = await simulatorApi.list(workspaceId);
    return resolveDevicePreviewPromptFromClaims(list.devices, workspaceId, skillPath);
  } catch {
    return formatDevicePreviewListPrompt([], skillPath);
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
    "simulator-device-use".includes(q) ||
    "simulator device use".includes(q) ||
    "device-use".includes(q) ||
    "device use".includes(q) ||
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
