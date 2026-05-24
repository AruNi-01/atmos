import React from "react";

import type {
  FileTreeNode,
  GithubIssuePayload,
  GithubPrPayload,
  LlmProvidersFile,
} from "@/api/ws-api";
import { AtmosWordmark } from "@/shared/components/ui/AtmosWordmark";
import type { ComposerAttachment } from "@/features/welcome/components/AttachmentBar";

export interface RepoContext {
  owner: string;
  repo: string;
}

export interface AgentMenuOption {
  id: string;
  label: string;
  command: string;
  launchCommand: string;
  iconType: "built-in" | "custom";
}

export interface MentionFileCandidate {
  name: string;
  relativePath: string;
  isDir: boolean;
  isHidden: boolean;
}

export type WelcomeSummaryItem = {
  key:
    | "display-name"
    | "base-branch"
    | "workspace-branch"
    | "github-issue"
    | "github-pr"
    | "auto-todos";
  value: string;
  title: string;
};

export type WelcomeHeadline =
  | "come_alive"
  | "spin_up_next"
  | "start_building_with_you"
  | "deserves_workspace";

export const ISSUE_CACHE_TTL_MS = 5 * 60 * 1000;
export const issueListCache = new Map<
  string,
  { expiresAt: number; issues: GithubIssuePayload[] }
>();
export const prListCache = new Map<string, { expiresAt: number; prs: GithubPrPayload[] }>();

export const WELCOME_HEADLINES: WelcomeHeadline[] = [
  "come_alive",
  "spin_up_next",
  "start_building_with_you",
  "deserves_workspace",
];
export const DEFAULT_WELCOME_HEADLINE: WelcomeHeadline = "come_alive";

export const PLACEHOLDER_TEMPLATES = [
  (project: string, agent: string) => `What should ${agent} make inside ${project}?`,
  (project: string, agent: string) => `Give ${agent} a direction for ${project}.`,
  (project: string, agent: string) => `Start something new in ${project} with ${agent}.`,
  (project: string, agent: string) => `What do you want ${agent} to shape in ${project}?`,
  (project: string, agent: string) => `Let ${agent} build the next idea in ${project}.`,
  (project: string, agent: string) => `Turn a spark into something real in ${project} with ${agent}.`,
  (project: string, agent: string) => `What should ${agent} bring to life in ${project}?`,
  (project: string, agent: string) => `Begin with ${agent}. Build in ${project}.`,
] as const;

export function useDebouncedPopoverQuery(
  popover: { query: string } | null,
  delayMs: number,
) {
  const [debouncedQuery, setDebouncedQuery] = React.useState("");

  React.useEffect(() => {
    if (!popover) {
      setDebouncedQuery("");
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedQuery(popover.query.trim());
    }, delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, popover]);

  return debouncedQuery;
}

export function useWelcomeComposerPlaceholder({
  agentLabel,
  projectName,
}: {
  agentLabel?: string;
  projectName?: string;
}) {
  const [templateIndex, setTemplateIndex] = React.useState(() =>
    Math.floor(Math.random() * PLACEHOLDER_TEMPLATES.length),
  );
  React.useEffect(() => {
    setTemplateIndex(Math.floor(Math.random() * PLACEHOLDER_TEMPLATES.length));
  }, [agentLabel, projectName]);

  const composerPlaceholder = React.useMemo(() => {
    const resolvedProjectName = projectName?.trim() || "Specified Project";
    const resolvedAgentName = agentLabel?.trim() || "Code Agent";

    return PLACEHOLDER_TEMPLATES[templateIndex](resolvedProjectName, resolvedAgentName);
  }, [agentLabel, projectName, templateIndex]);
  const [visiblePlaceholder, setVisiblePlaceholder] = React.useState(composerPlaceholder);
  const [exitingPlaceholder, setExitingPlaceholder] = React.useState<string | null>(null);
  const visiblePlaceholderRef = React.useRef(composerPlaceholder);

  React.useEffect(() => {
    if (composerPlaceholder === visiblePlaceholderRef.current) return;

    setExitingPlaceholder(visiblePlaceholderRef.current);
    visiblePlaceholderRef.current = composerPlaceholder;
    setVisiblePlaceholder(composerPlaceholder);
    const timer = window.setTimeout(() => setExitingPlaceholder(null), 260);
    return () => window.clearTimeout(timer);
  }, [composerPlaceholder]);

  return { exitingPlaceholder, visiblePlaceholder };
}

export function buildAutoExtractDescription({
  hasPreview,
  isLlmRoutingLoading,
  kind,
  todoProviderLabel,
}: {
  hasPreview: boolean;
  isLlmRoutingLoading: boolean;
  kind: "issue" | "pr";
  todoProviderLabel: string | null;
}) {
  if (!hasPreview) return `Import a GitHub ${kind === "pr" ? "PR" : "issue"} first.`;
  if (isLlmRoutingLoading) return "Checking LLM routing...";
  if (todoProviderLabel) {
    return `Uses ${todoProviderLabel} to extract an initial task checklist from the ${kind === "pr" ? "PR" : "issue"} description.`;
  }
  return "Configure LLM Providers > Routing > Workspace issue TODO extraction first.";
}

export function buildWelcomeSummaryItems({
  autoExtractTodos,
  autoExtractTodosPr,
  baseBranch,
  branch,
  canAutoExtractTodos,
  issuePreview,
  name,
  prPreview,
}: {
  autoExtractTodos: boolean;
  autoExtractTodosPr: boolean;
  baseBranch: string;
  branch: string;
  canAutoExtractTodos: boolean;
  issuePreview: GithubIssuePayload | null;
  name: string;
  prPreview: GithubPrPayload | null;
}): WelcomeSummaryItem[] {
  const items: WelcomeSummaryItem[] = [];
  const displayName = name.trim();
  const selectedBaseBranch = baseBranch.trim();
  const workspaceBranch = branch.trim();

  if (displayName) {
    items.push({
      key: "display-name",
      value: displayName,
      title: `Workspace display name: ${displayName}`,
    });
  }
  if (selectedBaseBranch) {
    items.push({
      key: "base-branch",
      value: `origin/${selectedBaseBranch}`,
      title: `Base branch: origin/${selectedBaseBranch}`,
    });
  }
  if (workspaceBranch) {
    items.push({
      key: "workspace-branch",
      value: workspaceBranch,
      title: `Current workspace branch: ${workspaceBranch}`,
    });
  }
  if (issuePreview) {
    items.push({
      key: "github-issue",
      value: `#${issuePreview.number}`,
      title: `GitHub issue: #${issuePreview.number}`,
    });
  }
  if (prPreview) {
    items.push({
      key: "github-pr",
      value: `PR#${prPreview.number}`,
      title: `GitHub PR: #${prPreview.number} (${prPreview.head_ref})`,
    });
  }
  const autoTodosOn = (issuePreview && autoExtractTodos) || (prPreview && autoExtractTodosPr);
  if (autoTodosOn && canAutoExtractTodos) {
    items.push({
      key: "auto-todos",
      value: "TODOs",
      title: "Auto-extract TODOs with LLM: on",
    });
  }

  return items;
}

const PROMPT_CARD_NOTCH_WIDTH_PX = 32;
const PROMPT_CARD_NOTCH_HEIGHT_PX = 26;
// 25px ≈ rounded-[1.55rem]; approximated with 3 midpoints per corner (θ≈20°, 45°, 70°)
const promptCardNotchClipPath = [
  `polygon(${PROMPT_CARD_NOTCH_WIDTH_PX}px 0px`,
  // top-right corner
  "calc(100% - 25px) 0px",
  "calc(100% - 16px) 2px",
  "calc(100% - 7px) 7px",
  "calc(100% - 2px) 16px",
  "100% 25px",
  // bottom-right corner
  "100% calc(100% - 25px)",
  "calc(100% - 2px) calc(100% - 16px)",
  "calc(100% - 7px) calc(100% - 7px)",
  "calc(100% - 16px) calc(100% - 2px)",
  "calc(100% - 25px) 100%",
  // bottom-left corner
  "25px 100%",
  "16px calc(100% - 2px)",
  "7px calc(100% - 7px)",
  "2px calc(100% - 16px)",
  "0px calc(100% - 25px)",
  `0px ${PROMPT_CARD_NOTCH_HEIGHT_PX}px`,
  "10.0px 26.0px",
  "11.5px 26.0px",
  "12.9px 25.9px",
  "14.2px 25.8px",
  "15.5px 25.6px",
  "16.7px 25.4px",
  "17.9px 25.1px",
  "18.9px 24.7px",
  "20.0px 24.3px",
  "20.9px 23.8px",
  "21.8px 23.3px",
  "22.5px 22.6px",
  "23.2px 21.9px",
  "23.9px 21.1px",
  "24.4px 20.2px",
  "24.9px 19.3px",
  "25.3px 18.2px",
  "25.6px 17.0px",
  "25.8px 15.8px",
  "26.0px 14.4px",
  "26.0px 13.0px",
  "26px 9px",
  "26px 5px",
  "26px 0",
  `${PROMPT_CARD_NOTCH_WIDTH_PX}px 0)`,
].join(", ");

export const promptCardNotchSurfaceStyle: React.CSSProperties = {
  clipPath: promptCardNotchClipPath,
  filter:
    "drop-shadow(0 0 0.8px color-mix(in srgb, var(--border) 58%, transparent)) drop-shadow(0 14px 34px rgba(0,0,0,0.14))",
};

const POKEMON_NAMES = [
  "bulbasaur",
  "ivysaur",
  "venusaur",
  "charmander",
  "charmeleon",
  "charizard",
  "squirtle",
  "wartortle",
  "blastoise",
  "butterfree",
  "pikachu",
  "raichu",
  "vulpix",
  "jigglypuff",
  "zubat",
  "psyduck",
  "growlithe",
  "abra",
  "machop",
  "geodude",
  "ponyta",
  "slowpoke",
  "magnemite",
  "gastly",
  "gengar",
  "onix",
  "cubone",
  "chansey",
  "scyther",
  "magikarp",
  "gyarados",
  "lapras",
  "eevee",
  "vaporeon",
  "jolteon",
  "flareon",
  "snorlax",
  "articuno",
  "zapdos",
  "moltres",
  "dragonite",
  "mew",
  "mewtwo",
] as const;

function getRandomPokemonName(): string {
  return POKEMON_NAMES[Math.floor(Math.random() * POKEMON_NAMES.length)];
}

export function resolvePromptPlaceholders(text: string, atts: ComposerAttachment[]): string {
  return text
    .replace(/@(?:issue|pr)#\d+/g, () => ".atmos/context/requirement.md")
    .replace(/@file:([^\s]+)/g, (_match, relativePath: string) => relativePath)
    .replace(/\[#img-(\d+)\]/g, (match, n: string) => {
      const att = atts.find((a) => a.number === Number(n));
      return att ? `.atmos/attachments/${att.filename}` : match;
    });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function isHiddenRelativePath(relativePath: string): boolean {
  return relativePath.split("/").some((segment) => segment.startsWith("."));
}

export function flattenFileTreeToCandidates(
  nodes: FileTreeNode[],
  parent = "",
): MentionFileCandidate[] {
  const out: MentionFileCandidate[] = [];
  for (const node of nodes) {
    const relativePath = parent ? `${parent}/${node.name}` : node.name;
    out.push({
      name: node.name,
      relativePath,
      isDir: node.is_dir,
      isHidden: isHiddenRelativePath(relativePath),
    });
    if (node.children?.length) {
      out.push(...flattenFileTreeToCandidates(node.children, relativePath));
    }
  }
  return out;
}

export function issueToWorkspaceName(issue: GithubIssuePayload): string {
  const title = issue.title.trim();
  return title ? `[issue#${issue.number}] ${title}` : `[issue#${issue.number}]`;
}

export function issueToBranchName(issue: GithubIssuePayload): string {
  return `issue-${issue.number}-${getRandomPokemonName()}`;
}

export function prToWorkspaceName(pr: GithubPrPayload): string {
  const title = pr.title.trim();
  return title ? `[PR#${pr.number}] ${title}` : `[PR#${pr.number}]`;
}

export function regeneratePokemonSuffixBranch(
  branchName: string,
  issueNumber?: number,
): string {
  const randomPokemon = getRandomPokemonName();

  if (typeof issueNumber === "number") {
    return `issue-${issueNumber}-${randomPokemon}`;
  }

  const matchedIssue = branchName.trim().match(/^issue-(\d+)(?:-.+)?$/i);
  if (matchedIssue?.[1]) {
    return `issue-${matchedIssue[1]}-${randomPokemon}`;
  }

  return branchName.trim()
    ? `${branchName.trim()}-${randomPokemon}`
    : `issue-${Math.floor(Math.random() * 1000)}-${randomPokemon}`;
}

export function resolveWorkspaceIssueTodoProvider(
  config: LlmProvidersFile,
): { id: string; label: string } | null {
  const providerId = config.features.workspace_issue_todo ?? null;
  if (!providerId) return null;

  const provider = config.providers[providerId];
  if (!provider?.enabled) return null;

  return {
    id: providerId,
    label: provider.displayName?.trim() || providerId,
  };
}

export function sanitizeCreateWorkspaceErrorMessage(message: string): string {
  return message
    .replace(/^\[error\]\s*/i, "")
    .replace(/^validation error:\s*/i, "")
    .trim();
}

export function isBranchConflictError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("branch `") ||
    normalized.includes("workspace directory") ||
    normalized.includes("directory name") ||
    normalized.includes("conflicts with an existing branch or workspace") ||
    normalized.includes("branch name already exists") ||
    normalized.includes("branch already exists")
  );
}

export function isAutoGeneratedBranchConflictError(message: string): boolean {
  return message.toLowerCase().includes("auto-generated workspace directory name");
}

export function renderHeadline(headline: WelcomeHeadline): React.ReactNode {
  const logo = (
    <span className="inline-flex items-center">
      <AtmosWordmark
        className="gap-0"
        logoClassName="size-10 sm:size-12 md:size-14"
        letterClassName="text-4xl sm:text-5xl md:text-6xl leading-none font-semibold"
        sloganClassName="hidden"
      />
    </span>
  );

  switch (headline) {
    case "come_alive":
      return (
        <>
          <span>What should come alive in</span>
          <span className="inline-flex items-center gap-x-3">
            {logo}
            <span>?</span>
          </span>
        </>
      );
    case "spin_up_next":
      return (
        <>
          <span>What do you want</span>
          {logo}
          <span className="whitespace-nowrap">to spin up next?</span>
        </>
      );
    case "start_building_with_you":
      return (
        <>
          <span>What should</span>
          {logo}
          <span className="whitespace-nowrap">start building with you?</span>
        </>
      );
    case "deserves_workspace":
      return (
        <>
          <span>What idea deserves an</span>
          {logo}
          <span className="whitespace-nowrap">workspace?</span>
        </>
      );
  }
}
