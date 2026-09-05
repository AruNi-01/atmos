import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { normalizeFsPath } from "@/features/agent/lib/tool-results/parse-tool-result";

export type PlanOverviewStep = {
  id: string;
  title: string;
};

export type PlanOverview = {
  title?: string;
  summary?: string;
  steps: PlanOverviewStep[];
  contentMarkdown: string;
};

const PLAN_FILE_NAME_RE = /(?:^|[/\\])(?:plan|PLAN)\.md$/i;
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

function extractSteps(markdown: string): PlanOverviewStep[] {
  const lines = markdown.split(/\r?\n/);
  const checked: string[] = [];
  const bullets: string[] = [];
  let inStepsSection = false;

  for (const raw of lines) {
    const heading = raw.match(/^#{2,6}\s+(.+)$/);
    if (heading) {
      inStepsSection = /step|todo|to-?dos?|plan|outline|里程碑|步骤|任务/i.test(heading[1] ?? "");
      continue;
    }
    const check = raw.match(CHECK_RE);
    if (check?.[1]) {
      checked.push(check[1].trim());
      continue;
    }
    if (!inStepsSection && checked.length > 0) continue;
    const bullet = raw.match(BULLET_RE);
    if (bullet?.[1] && (inStepsSection || checked.length === 0)) {
      const title = bullet[1].trim();
      if (title.length > 0 && title.length < 200) bullets.push(title);
    }
  }

  const source = checked.length > 0 ? checked : bullets.slice(0, 12);
  return source.map((title, index) => ({ id: String(index), title }));
}

/** Derive ApprovalCard plan intro/steps from plan markdown (not live TodoWrite). */
export function parsePlanOverviewFromMarkdown(markdown: string | null | undefined): PlanOverview | null {
  const contentMarkdown = markdown?.trim() ?? "";
  if (!contentMarkdown) return null;

  const titleMatch = contentMarkdown.match(H1_RE);
  const title = titleMatch?.[1]?.trim() || undefined;
  const summary = firstParagraph(contentMarkdown, title);
  const steps = extractSteps(contentMarkdown);

  return {
    title,
    summary,
    steps,
    contentMarkdown,
  };
}

function toolPathFromPart(part: Extract<AgentMessage["parts"][number], { type: "tool_call" }>): string | null {
  const params = part.params;
  if (params?.type === "read" || params?.type === "edit" || params?.type === "delete") {
    return params.path?.trim() || null;
  }
  if (params?.type === "move") return params.to?.trim() || params.from?.trim() || null;
  const result = part.result;
  if (result && "path" in result && typeof result.path === "string" && result.path.trim()) {
    return result.path.trim();
  }
  const title = (part.title || part.name || "").trim();
  if (PLAN_FILE_NAME_RE.test(title)) return title;
  return null;
}

/** Latest plan.md (or PLAN.md) path written/read in the transcript. */
export function findRecentPlanFilePath(messages: AgentMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (part.type !== "tool_call") continue;
      if (part.kind !== "edit" && part.kind !== "read" && part.kind !== "other") continue;
      const raw = toolPathFromPart(part);
      const normalized = normalizeFsPath(raw) ?? raw;
      if (!normalized) continue;
      if (PLAN_FILE_NAME_RE.test(normalized)) return normalized;
    }
  }
  return null;
}
