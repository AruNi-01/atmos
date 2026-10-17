import type { AgentToolKind } from "@atmos/api-types/ws/dto/agent-chat";
import {
  hostFromUrl,
  presentAgentTool,
  stripPathEchoFromToolHeading,
  toolTitleLooksLikePath,
} from "./present";
import type { AgentToolCallPart } from "./tool-kind";

const COMMAND_MAX = 80;

/** English kind verb. Web passes the same words through its locale lookup. */
export function toolKindHeadlineLabel(kind: AgentToolKind): string {
  switch (kind) {
    case "read":
      return "Read";
    case "edit":
      return "Edit";
    case "search":
    case "web_search":
      return "Search";
    case "execute":
      return "Execute";
    case "fetch":
      return "Fetch";
    case "delete":
      return "Delete";
    case "move":
      return "Move";
    case "skill":
    case "subagent":
    case "mcp_list":
    case "mcp_call":
    case "image_gen":
    case "plan_document":
    case "other":
      return "Tool";
  }
}

function fileNameFromToolPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function pathFromToolPart(part: AgentToolCallPart): string | null {
  const params = part.params;
  if (!params) return null;
  switch (params.type) {
    case "read":
    case "edit":
    case "delete":
      return params.path?.trim() || null;
    case "move":
      return params.to?.trim() || params.from?.trim() || null;
    case "image_gen":
      return params.path?.trim() || null;
    default:
      return null;
  }
}

function truncateCommand(command: string): string {
  const trimmed = command.trim().replace(/\s+/g, " ");
  if (trimmed.length <= COMMAND_MAX) return trimmed;
  return `${trimmed.slice(0, COMMAND_MAX - 1)}…`;
}

function formatDiffStatsSuffix(additions: number, deletions: number): string {
  const bits: string[] = [];
  if (additions > 0) bits.push(`+${additions}`);
  if (deletions > 0) bits.push(`-${deletions}`);
  return bits.join(" ");
}

function countPatchStats(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}

function countCodeLines(code: string): number {
  if (!code) return 0;
  return code.split("\n").length - (code.endsWith("\n") ? 1 : 0);
}

/**
 * Diff suffix for one edit. `diff_stats` and patch text are counted here.
 * A full old/new file body stays on the tool row; counting it needs the web
 * diff parser, which this package does not take.
 */
function activityDiffStats(part: AgentToolCallPart): { additions: number; deletions: number } {
  if (part.kind !== "edit") return { additions: 0, deletions: 0 };
  const result = part.result;
  if (result?.type === "diff_stats") {
    return { additions: result.additions, deletions: result.deletions };
  }
  if (result?.type === "diff") return { additions: 0, deletions: 0 };
  const presentation = presentAgentTool(part).presentation;
  if (presentation.kind === "diff_stats") {
    return { additions: presentation.additions, deletions: presentation.deletions };
  }
  if (presentation.kind === "patch") return countPatchStats(presentation.patch);
  if (presentation.kind === "code" && presentation.hint === "new") {
    return { additions: countCodeLines(presentation.code), deletions: 0 };
  }
  if (presentation.kind === "code" && presentation.hint === "deleted") {
    return { additions: 0, deletions: countCodeLines(presentation.code) };
  }
  return { additions: 0, deletions: 0 };
}

/**
 * Plain-text stand-in for a tool row's one-line header (verb + file/query +
 * diff stats), used by the transcript activity indicator.
 */
export function formatAgentToolActivityLine(part: AgentToolCallPart, kindLabel: string): string {
  const path = pathFromToolPart(part);
  const file = path ? fileNameFromToolPath(path) : "";
  const command = part.params?.type === "execute" ? part.params.command.trim() : "";
  const query =
    part.params?.type === "search" || part.params?.type === "web_search"
      ? part.params.query.trim()
      : "";
  const url = part.params?.type === "fetch" ? part.params.url.trim() : "";
  const skill = part.params?.type === "skill" ? part.params.skill.trim() : "";
  const rawTitle = (part.title || "").trim();
  const stats = activityDiffStats(part);

  const genericTitle = rawTitle.toLowerCase() === kindLabel.trim().toLowerCase();
  let head = rawTitle;
  if (!head || genericTitle || (path && toolTitleLooksLikePath(head, path))) {
    head = kindLabel;
  } else if (path) {
    const stripped = stripPathEchoFromToolHeading(head, path, file ? [file] : []);
    if (stripped) head = stripped;
  }

  const extras: string[] = [];
  if (file && !head.includes(file)) extras.push(file);
  else if (query && !head.includes(query)) extras.push(query);
  else if (url) {
    const host = hostFromUrl(url) ?? url;
    if (host && !head.includes(host)) extras.push(host);
  } else if (skill && !head.includes(skill)) extras.push(skill);
  else if (command && !head.includes(command) && (!rawTitle || genericTitle)) {
    extras.push(truncateCommand(command));
  }

  let line = extras.length > 0 ? `${head} ${extras.join(" ")}` : head;
  const suffix = formatDiffStatsSuffix(stats.additions, stats.deletions);
  if (suffix && !line.includes(suffix)) line = `${line} ${suffix}`;
  return line.replace(/\s+/g, " ").trim();
}
