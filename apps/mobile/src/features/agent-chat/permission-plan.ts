/**
 * Plan-exit helpers matching `apps/web` `AgentPermissionCard` and
 * `parsePlanOverviewFromMarkdown`. Checklist items are `- [ ]` / `- [x]` only.
 */

export type PermissionChoice = {
  option_id: string;
  name: string;
  kind?: string;
};

export type PlanStep = { id: string; title: string };

export type PlanOverview = {
  title?: string;
  summary?: string;
  steps: PlanStep[];
  contentMarkdown: string;
};

const H1_RE = /^#\s+(.+)$/m;
const CHECK_RE = /^\s*[-*+]\s+\[[ xX]\]\s+(.+)$/;
const BULLET_RE = /^\s*(?:[-*+]|\d+[.)])\s+(.+)$/;

function firstParagraph(markdown: string, skipTitle: string | undefined): string | undefined {
  const lines = markdown.split(/\r?\n/);
  const chunks: string[] = [];
  let collecting = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (collecting) break;
      continue;
    }
    if (/^#{1,6}\s/.test(line)) continue;
    if (CHECK_RE.test(line) || BULLET_RE.test(line)) {
      if (collecting) break;
      continue;
    }
    if (skipTitle && line === skipTitle) continue;
    collecting = true;
    chunks.push(line.replace(/^>\s?/, ""));
  }
  const text = chunks.join(" ").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > 280 ? `${text.slice(0, 277).trimEnd()}…` : text;
}

function extractSteps(markdown: string): PlanStep[] {
  const checked: string[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const check = raw.match(CHECK_RE);
    const title = check?.[1]?.trim() ?? "";
    if (title.length > 0 && title.length < 200) checked.push(title);
  }
  return checked.map((title, index) => ({ id: String(index), title }));
}

export function parsePlanOverviewFromMarkdown(
  markdown: string | null | undefined,
  options?: { includeChecklistSteps?: boolean },
): PlanOverview | null {
  const contentMarkdown = markdown?.trim() ?? "";
  if (!contentMarkdown) return null;
  const title = contentMarkdown.match(H1_RE)?.[1]?.trim() || undefined;
  const includeChecklistSteps = options?.includeChecklistSteps !== false;
  return {
    title,
    summary: firstParagraph(contentMarkdown, title),
    steps: includeChecklistSteps ? extractSteps(contentMarkdown) : [],
    contentMarkdown,
  };
}

export function planStepsFromTodos(
  todos: readonly { id?: string | null; content: string }[],
): PlanStep[] {
  return todos.flatMap((todo, index) => {
    const title = todo.content.trim();
    if (!title) return [];
    return [{ id: todo.id?.trim() || String(index), title }];
  });
}

export function defaultAllowOptionId(options: readonly PermissionChoice[]): string {
  const allow = options.find(
    (option) =>
      /allow|accept|approve/i.test(option.option_id) ||
      /allow|accept|approve/i.test(option.kind ?? "") ||
      /allow|accept|approve/i.test(option.name),
  );
  return allow?.option_id ?? options[0]?.option_id ?? "allow_once";
}

export function defaultRejectOptionId(options: readonly PermissionChoice[]): string {
  const reject = options.find(
    (option) =>
      /reject|deny|skip|cancel|decline/i.test(option.option_id) ||
      /reject|deny|skip|cancel|decline/i.test(option.kind ?? "") ||
      /reject|deny|skip|cancel|decline|^no\b/i.test(option.name),
  );
  return reject?.option_id ?? "reject_once";
}

export const PLAN_TODO_PREVIEW_COUNT = 3;

export function planPermissionModel(input: {
  description: string;
  markdown: string;
  options: readonly PermissionChoice[];
  todos: readonly { id?: string | null; content: string }[];
}): {
  allowId: string;
  markdown: string;
  rejectId: string;
  steps: PlanStep[];
  summary?: string;
  title?: string;
} {
  const structured = planStepsFromTodos(input.todos);
  const overview = parsePlanOverviewFromMarkdown(input.markdown, {
    includeChecklistSteps: structured.length === 0,
  });
  const description = input.description.trim();
  return {
    allowId: defaultAllowOptionId(input.options),
    markdown: overview?.contentMarkdown ?? "",
    rejectId: defaultRejectOptionId(input.options),
    steps: structured.length > 0 ? structured : (overview?.steps ?? []),
    summary: overview?.summary,
    title: overview?.title || description || undefined,
  };
}
