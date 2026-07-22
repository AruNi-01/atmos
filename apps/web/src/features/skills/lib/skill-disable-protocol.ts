export const SKILL_DISABLE_PROTOCOL = "atmos://skill-disable";
export const SKILL_DISABLE_DISMISS_SECONDS = 5;

/**
 * One skill touched during a disable-session. Counts only net changes vs the
 * status before the first toggle in this session (toggle back → no +/-).
 */
export type SkillDisableSessionAction = {
  id: string;
  name: string;
  /** Enabled state before the first toggle in this session. */
  initialEnabled: boolean;
  /** Latest enabled state after toggles in this session. */
  currentEnabled: boolean;
};

export type SkillDisableSessionCounts = {
  enabled: number;
  disabled: number;
};

export type SkillDisableSessionNameLists = {
  enabled: string[];
  disabled: string[];
};

export function formatSkillDisableProtocol(): string {
  return SKILL_DISABLE_PROTOCOL;
}

export function parseSkillDisableProtocolToken(token: string): boolean {
  return token === SKILL_DISABLE_PROTOCOL;
}

/**
 * Remove the skill-disable chip token so it never lands in an Agent / workspace prompt.
 * Filter text lives inside the chip DOM and is not part of serialize(), so only the token
 * needs stripping.
 */
export function stripSkillDisableSession(text: string): string {
  const idx = text.indexOf(SKILL_DISABLE_PROTOCOL);
  if (idx < 0) return text;
  // Only clear spaces that sat immediately after the protocol token (the seam).
  // Do not collapse intentional whitespace elsewhere in the prompt.
  const before = text.slice(0, idx);
  const after = text.slice(idx + SKILL_DISABLE_PROTOCOL.length).replace(/^[\u00A0 ]+/, "");
  return `${before}${after}`.trimEnd();
}

export function upsertSkillDisableSessionAction(
  actions: SkillDisableSessionAction[],
  skillId: string,
  skillName: string,
  /** Enabled state before this toggle (from the skill row / prior known state). */
  beforeEnabled: boolean,
  /** Enabled state after a successful toggle. */
  afterEnabled: boolean,
): SkillDisableSessionAction[] {
  const existing = actions.find((action) => action.id === skillId);
  if (existing) {
    return actions.map((action) =>
      action.id === skillId
        ? { ...action, name: skillName, currentEnabled: afterEnabled }
        : action,
    );
  }
  return [
    ...actions,
    {
      id: skillId,
      name: skillName,
      initialEnabled: beforeEnabled,
      currentEnabled: afterEnabled,
    },
  ];
}

export function skillDisableSessionNameLists(
  actions: SkillDisableSessionAction[],
): SkillDisableSessionNameLists {
  const enabled: string[] = [];
  const disabled: string[] = [];
  for (const action of actions) {
    if (action.currentEnabled === action.initialEnabled) continue;
    if (action.currentEnabled) enabled.push(action.name);
    else disabled.push(action.name);
  }
  return { enabled, disabled };
}

export function skillDisableSessionCounts(
  actions: SkillDisableSessionAction[],
): SkillDisableSessionCounts {
  const lists = skillDisableSessionNameLists(actions);
  return { enabled: lists.enabled.length, disabled: lists.disabled.length };
}
