import type { AutomationsView } from "@/shared/lib/nuqs/searchParams";

export function parseAutomationsView(
  raw: string | null | undefined,
): AutomationsView {
  if (raw === "create" || raw === "edit" || raw === "history") return raw;
  return "list";
}

/**
 * Show setup if either the hook or the live address bar asks for it.
 * `useSearchParams()` can lag a same-page query write; `window.location`
 * plus the nuqs hook together cover that gap without a hard reload.
 */
export function resolveAutomationsPageView(
  hookView: AutomationsView,
  urlView: AutomationsView,
): AutomationsView {
  if (hookView === "create" || urlView === "create") return "create";
  if (hookView === "edit" || urlView === "edit") return "edit";
  if (hookView === "history" || urlView === "history") return "history";
  return "list";
}

export function automationsViewFromLocation(
  search: string | null | undefined,
): AutomationsView {
  const query = search?.startsWith("?") ? search.slice(1) : (search ?? "");
  return parseAutomationsView(new URLSearchParams(query).get("automationView"));
}

export function automationsCreateQuery() {
  return {
    automationView: "create" as const,
    automationId: null,
    automationRun: null,
  };
}

export function automationsListQuery(overrides?: {
  automationView?: AutomationsView;
  automationId?: string | null;
  automationRun?: string | null;
}) {
  return {
    automationView: "list" as const,
    automationId: null,
    automationRun: null,
    ...overrides,
  };
}

export function automationsEditQuery(automationId: string) {
  return {
    automationView: "edit" as const,
    automationId,
    automationRun: null,
  };
}
