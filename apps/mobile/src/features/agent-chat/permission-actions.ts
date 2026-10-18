export type PermissionActionOption = {
  option_id: string;
  name: string;
  kind?: string;
};

export type PermissionActionTone = "primary" | "ghost";

/** Mirrors web `isRejectOption` on AgentPermissionCard. */
export function isRejectPermissionOption(option: PermissionActionOption): boolean {
  return (
    /reject|deny|skip|cancel|decline/i.test(option.option_id) ||
    /reject|deny|skip|cancel|decline/i.test(option.kind ?? "") ||
    /reject|deny|skip|cancel|decline|^no\b/i.test(option.name)
  );
}

/** Mirrors web `isAllowOnceOption`. */
export function isAllowOncePermissionOption(option: PermissionActionOption): boolean {
  const id = option.option_id;
  const kind = option.kind ?? "";
  const name = option.name;
  return (
    /allow[_-]?once|^allow$|^accept$|^once$|^yes$/i.test(id) ||
    /allow[_-]?once|^allow$|^accept$|^once$/i.test(kind) ||
    /^allow once$|^yes$|^accept$/i.test(name.trim())
  );
}

/** Prefer once/accept over always so Grok-style order still primaries once. */
export function preferredPrimaryPermissionOptionId(
  options: PermissionActionOption[],
): string | null {
  const once = options.find(isAllowOncePermissionOption);
  if (once) return once.option_id;
  const allow = options.find(
    (option) =>
      /allow|accept|approve/i.test(option.option_id) ||
      /allow|accept|approve/i.test(option.kind ?? "") ||
      /allow|accept|approve/i.test(option.name),
  );
  return allow?.option_id ?? options[0]?.option_id ?? null;
}

/** Web command actions: Allow is primary, Deny and the rest are ghost. */
export function permissionOptionTone(
  option: PermissionActionOption,
  options: PermissionActionOption[],
): PermissionActionTone {
  const primaryId = preferredPrimaryPermissionOptionId(options);
  return option.option_id === primaryId && !isRejectPermissionOption(option) ? "primary" : "ghost";
}
