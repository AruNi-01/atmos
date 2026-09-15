import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { isGenericToolLabel } from "@/features/agent/lib/agent-tool-kind";
import { sumToolGroupDiffStats } from "@/features/agent/lib/tool-results/diff-stats";
import {
  hostFromUrl,
  stripPathEchoFromToolHeading,
  toolTitleLooksLikePath,
} from "@/features/agent/lib/tool-results/parse-tool-result";

const COMMAND_MAX = 80;

export function fileNameFromToolPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export function pathFromToolPart(part: AgentToolCallPart): string | null {
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

/**
 * Plain-text stand-in for a tool row's one-line header (verb + file/query +
 * diff stats), used by the transcript activity indicator.
 */
export function formatAgentToolActivityLine(
  part: AgentToolCallPart,
  kindLabel: string,
): string {
  const path = pathFromToolPart(part);
  const file = path ? fileNameFromToolPath(path) : "";
  const command = part.params?.type === "execute" ? part.params.command.trim() : "";
  const query = part.params?.type === "search" || part.params?.type === "web_search"
    ? part.params.query.trim()
    : "";
  const url = part.params?.type === "fetch" ? part.params.url.trim() : "";
  const skill = part.params?.type === "skill" ? part.params.skill.trim() : "";
  const rawTitle = (part.title || "").trim();
  const stats = sumToolGroupDiffStats([part]);

  let head = rawTitle;
  if (!head || isGenericToolLabel(head) || (path && toolTitleLooksLikePath(head, path))) {
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
  else if (command && !head.includes(command) && (isGenericToolLabel(rawTitle) || !rawTitle)) {
    extras.push(truncateCommand(command));
  }

  let line = extras.length > 0 ? `${head} ${extras.join(" ")}` : head;
  const suffix = formatDiffStatsSuffix(stats.additions, stats.deletions);
  if (suffix && !line.includes(suffix)) line = `${line} ${suffix}`;
  return line.replace(/\s+/g, " ").trim();
}
