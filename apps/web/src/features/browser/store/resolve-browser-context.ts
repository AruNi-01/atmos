export type ResolveBrowserContextResult = {
  ok: boolean;
  contextId?: string;
  error?: string;
  error_code?: string;
};

/**
 * Route `tabs open` (and other untargeted tab commands) to the Browser the
 * user is using: explicit target, then the unique UI-active panel, then the
 * last-active session's panel. Never silently pick among several unused hosts.
 */
export function resolveBrowserContext(input: {
  targetSessionId?: string;
  preferredSessionId?: string;
  panels: Record<string, { isActive: boolean }>;
  bySession: Record<string, { contextId: string }>;
}): ResolveBrowserContextResult {
  const explicit = input.targetSessionId?.trim() ?? "";
  if (explicit) {
    const bound = input.bySession[explicit];
    if (bound) return { ok: true, contextId: bound.contextId };
    return {
      ok: false,
      error: `unknown target_id ${explicit}`,
      error_code: "browser_route_unavailable",
    };
  }

  const entries = Object.entries(input.panels);
  if (entries.length === 0) {
    return {
      ok: false,
      error: "no Atmos Browser panel is mounted; open a Browser tab first",
      error_code: "embedded_browser_host_unavailable",
    };
  }
  if (entries.length === 1 && entries[0]) {
    return { ok: true, contextId: entries[0][0] };
  }

  const active = entries.filter(([, panel]) => panel.isActive);
  if (active.length === 1 && active[0]) {
    return { ok: true, contextId: active[0][0] };
  }

  const preferred = input.preferredSessionId?.trim() ?? "";
  if (preferred) {
    const bound = input.bySession[preferred];
    if (bound && input.panels[bound.contextId]) {
      return { ok: true, contextId: bound.contextId };
    }
  }

  return {
    ok: false,
    error: "multiple Browser panels are open; pass --target-id of a tab in the desired panel",
    error_code: "browser_ambiguous_target",
  };
}
