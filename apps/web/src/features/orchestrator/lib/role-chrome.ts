/**
 * APP-048 M18b — terminal / card header composition for Orchestrator roles.
 * Pure helper for unit tests and UI.
 */

export type OrchRole = "orchestrator" | "criteria" | "maker" | "verify";

export type RoleActivity =
  | "queued"
  | "active"
  | "waiting_user"
  | "succeeded"
  | "failed"
  | "cancelled";

const ROLE_LABEL_EN: Record<OrchRole, string> = {
  orchestrator: "Planner",
  criteria: "Criteria",
  maker: "Maker",
  verify: "Verify",
};

const ROLE_SHORT_EN: Record<OrchRole, string> = {
  orchestrator: "Pln",
  criteria: "Crit",
  maker: "Mk",
  verify: "Vf",
};

const ROLE_GLYPH: Record<OrchRole, string> = {
  orchestrator: "O",
  criteria: "C",
  maker: "M",
  verify: "V",
};

export function roleLabel(role: OrchRole, locale: "en" | "zh" = "en"): string {
  if (locale === "zh") {
    const zh: Record<OrchRole, string> = {
      orchestrator: "规划",
      criteria: "判定",
      maker: "执行",
      verify: "验收",
    };
    return zh[role];
  }
  return ROLE_LABEL_EN[role];
}

export function roleShort(role: OrchRole): string {
  return ROLE_SHORT_EN[role];
}

export function roleGlyph(role: OrchRole): string {
  return ROLE_GLYPH[role];
}

/** Full scan-line header (role + instance + activity when useful). */
export function composeRoleHeader(input: {
  role: OrchRole;
  agentDisplay: string;
  instance?: string | null;
  activity?: RoleActivity | string | null;
}): string {
  const label = ROLE_LABEL_EN[input.role];
  const parts = [`[${label}]`, input.agentDisplay.trim() || "Agent"];
  if (input.instance?.trim()) {
    parts.push(input.instance.trim());
  }
  const activity = input.activity?.trim();
  if (activity && activity !== "active") {
    parts.push(`(${activity})`);
  }
  return parts.join(" ");
}

/** Accessible name prioritizes role even when truncated UI drops goal text. */
export function composeAccessibleName(input: {
  role: OrchRole;
  agentDisplay: string;
  instance?: string | null;
  activity?: string | null;
}): string {
  return [
    roleGlyph(input.role),
    roleLabel(input.role),
    input.agentDisplay,
    input.instance,
    input.activity,
  ]
    .filter(Boolean)
    .join(" ");
}

export function roleAccentClass(role: OrchRole): string {
  switch (role) {
    case "orchestrator":
      return "border-l-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300";
    case "criteria":
      return "border-l-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-300";
    case "maker":
      return "border-l-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "verify":
      return "border-l-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
}
