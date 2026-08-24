import React from "react";
import { useTranslations } from "next-intl";

import type {
  FileTreeNode,
  GithubIssuePayload,
  GithubPrPayload,
  LlmProvidersFile,
} from "@/api/ws-api";
import type { ComposerAttachment } from "@/features/welcome/components/AttachmentBar";
import { formatAppshotPrompt } from "@/features/appshot/lib/appshot-protocol";
import { materializeAiContextText } from "@/shared/lib/ai-context-protocol";
import { agentCliRouteLabel } from "@/app-shell/llm-providers-modal-utils";

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
  description?: string | null;
  disabledReason?: string | null;
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
    | "linear-issue"
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

/**
 * Clear welcome GitHub list caches on Computer target switch (APP-035).
 * PR data is now owned by TanStack Query and cleared automatically via
 * Computer-scope key removal — only the issue list Map remains here.
 */
export function clearWelcomeGithubCaches(): void {
  issueListCache.clear();
}

export const WELCOME_HEADLINES: WelcomeHeadline[] = [
  "come_alive",
  "spin_up_next",
  "start_building_with_you",
  "deserves_workspace",
];
export const DEFAULT_WELCOME_HEADLINE: WelcomeHeadline = "come_alive";

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
  const t = useTranslations("Welcome.components");
  const placeholderTemplates = React.useMemo(
    () => [
      (project: string, agent: string) => t("helpers.placeholderTemplates.makeInside", { project, agent }),
      (project: string, agent: string) => t("helpers.placeholderTemplates.giveDirection", { project, agent }),
      (project: string, agent: string) => t("helpers.placeholderTemplates.startSomething", { project, agent }),
      (project: string, agent: string) => t("helpers.placeholderTemplates.shape", { project, agent }),
      (project: string, agent: string) => t("helpers.placeholderTemplates.buildNextIdea", { project, agent }),
      (project: string, agent: string) => t("helpers.placeholderTemplates.turnSparkReal", { project, agent }),
      (project: string, agent: string) => t("helpers.placeholderTemplates.bringToLife", { project, agent }),
      (project: string, agent: string) => t("helpers.placeholderTemplates.beginBuild", { project, agent }),
    ],
    [t],
  );
  const [templateIndex, setTemplateIndex] = React.useState(() =>
    Math.floor(Math.random() * placeholderTemplates.length),
  );
  React.useEffect(() => {
    setTemplateIndex(Math.floor(Math.random() * placeholderTemplates.length));
  }, [agentLabel, projectName, placeholderTemplates.length]);

  const composerPlaceholder = React.useMemo(() => {
    const resolvedProjectName = projectName?.trim() || t("helpers.placeholderDefaults.project");
    const resolvedAgentName = agentLabel?.trim() || t("helpers.placeholderDefaults.agent");

    return placeholderTemplates[templateIndex](resolvedProjectName, resolvedAgentName);
  }, [agentLabel, placeholderTemplates, projectName, t, templateIndex]);
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
  t,
}: {
  hasPreview: boolean;
  isLlmRoutingLoading: boolean;
  kind: "issue" | "pr";
  todoProviderLabel: string | null;
  t: (key: string, values?: Record<string, string | number | boolean | null | undefined>) => string;
}) {
  if (!hasPreview) return t("helpers.autoExtract.importFirst", { kind: kind === "pr" ? t("helpers.common.pr") : t("helpers.common.issue") });
  if (isLlmRoutingLoading) return t("helpers.autoExtract.checkingRouting");
  if (todoProviderLabel) {
    return t("helpers.autoExtract.usesProvider", {
      provider: todoProviderLabel,
      kind: kind === "pr" ? t("helpers.common.pr") : t("helpers.common.issue"),
    });
  }
  return t("helpers.autoExtract.configureRouting");
}

export function buildWelcomeSummaryItems({
  autoExtractTodos,
  autoExtractTodosPr,
  baseBranch,
  branch,
  canAutoExtractTodos,
  issuePreview,
  linearPreview,
  name,
  prPreview,
  t,
}: {
  autoExtractTodos: boolean;
  autoExtractTodosPr: boolean;
  baseBranch: string;
  branch: string;
  canAutoExtractTodos: boolean;
  issuePreview: GithubIssuePayload | null;
  linearPreview?: { identifier: string; title: string } | null;
  name: string;
  prPreview: GithubPrPayload | null;
  t: (key: string, values?: Record<string, string | number | boolean | null | undefined>) => string;
}): WelcomeSummaryItem[] {
  const items: WelcomeSummaryItem[] = [];
  const displayName = name.trim();
  const selectedBaseBranch = baseBranch.trim();
  const workspaceBranch = branch.trim();

  if (displayName) {
    items.push({
      key: "display-name",
      value: displayName,
      title: t("helpers.summary.displayNameTitle", { name: displayName }),
    });
  }
  if (selectedBaseBranch) {
    items.push({
      key: "base-branch",
      value: `origin/${selectedBaseBranch}`,
      title: t("helpers.summary.baseBranchTitle", { branch: `origin/${selectedBaseBranch}` }),
    });
  }
  if (workspaceBranch) {
    items.push({
      key: "workspace-branch",
      value: workspaceBranch,
      title: t("helpers.summary.workspaceBranchTitle", { branch: workspaceBranch }),
    });
  }
  if (linearPreview?.identifier) {
    items.push({
      key: "linear-issue",
      value: linearPreview.identifier,
      title: t("helpers.summary.linearIssueTitle", {
        identifier: linearPreview.identifier,
        title: linearPreview.title,
      }),
    });
  }
  if (issuePreview) {
    items.push({
      key: "github-issue",
      value: `#${issuePreview.number}`,
      title: t("helpers.summary.githubIssueTitle", { number: issuePreview.number }),
    });
  }
  if (prPreview) {
    items.push({
      key: "github-pr",
      value: `PR#${prPreview.number}`,
      title: t("helpers.summary.githubPrTitle", { number: prPreview.number, branch: prPreview.head_ref }),
    });
  }
  const autoTodosOn = (issuePreview && autoExtractTodos) || (prPreview && autoExtractTodosPr);
  if (autoTodosOn && canAutoExtractTodos) {
    items.push({
      key: "auto-todos",
      value: t("helpers.summary.autoTodosValue"),
      title: t("helpers.summary.autoTodosTitle"),
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

export function resolvePromptPlaceholders(
  text: string,
  atts: ComposerAttachment[],
  options?: { preserveFileMentions?: boolean },
): string {
  return materializeAiContextText(
    text
      .replace(/@(?:issue|pr)#\d+/g, () => ".atmos/context/requirement.md")
      .replace(/@file:([^\s]+)/g, (match, relativePath: string) =>
        options?.preserveFileMentions ? match : relativePath,
      )
      .replace(/\[#appshot:(\d{13})\]/g, (_match, timestamp: string) =>
        formatAppshotPrompt(timestamp),
      )
      .replace(/\[#img-(\d+)\]/g, (match, n: string) => {
        const att = atts.find((a) => a.number === Number(n));
        return att ? `.atmos/attachments/${att.filename}` : match;
      }),
  );
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

export function issueToWorkspaceName(issue: {
  number: number;
  title: string;
}): string {
  const title = issue.title.trim();
  return title ? `[issue#${issue.number}] ${title}` : `[issue#${issue.number}]`;
}

export function issueToBranchName(issue: { number: number }): string {
  return `issue-${issue.number}-${getRandomPokemonName()}`;
}

export function prToWorkspaceName(pr: { number: number; title: string }): string {
  const title = pr.title.trim();
  return title ? `[PR#${pr.number}] ${title}` : `[PR#${pr.number}]`;
}

/** Display name for Linear-linked workspace (matches Task → Create prefill). */
export function linearIssueToWorkspaceName(issue: {
  identifier: string;
  title: string;
}): string {
  const title = issue.title.trim();
  const id = issue.identifier.trim();
  if (title && id) return `${id} ${title}`.slice(0, 120);
  return (title || id || "Linear issue").slice(0, 120);
}

/**
 * Branch name from a Linear issue identifier (e.g. `LAN-48` → `lan-48-pikachu`).
 * Mirrors GitHub `issue-{n}-{pokemon}` so Create Workspace is ready without manual rename.
 */
export function linearIssueToBranchName(issue: {
  identifier: string;
}): string {
  const slug = issue.identifier
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = slug || "linear";
  return `${base}-${getRandomPokemonName()}`;
}

export function regeneratePokemonSuffixBranch(
  branchName: string,
  issueNumber?: number,
  linearIdentifier?: string | null,
): string {
  const randomPokemon = getRandomPokemonName();

  if (typeof issueNumber === "number") {
    return `issue-${issueNumber}-${randomPokemon}`;
  }

  if (linearIdentifier?.trim()) {
    return linearIssueToBranchName({ identifier: linearIdentifier });
  }

  const matchedIssue = branchName.trim().match(/^issue-(\d+)(?:-.+)?$/i);
  if (matchedIssue?.[1]) {
    return `issue-${matchedIssue[1]}-${randomPokemon}`;
  }

  // Linear-style `lan-48-pikachu` → keep identifier prefix, new pokemon suffix.
  const matchedLinear = branchName
    .trim()
    .match(/^([a-z][a-z0-9]*(?:-[0-9]+)+)-[a-z0-9]+$/i);
  if (matchedLinear?.[1]) {
    return `${matchedLinear[1].toLowerCase()}-${randomPokemon}`;
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

  const localAgentLabel = agentCliRouteLabel(providerId);
  if (localAgentLabel) {
    return {
      id: providerId,
      label: localAgentLabel,
    };
  }

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

export type HeadlineTypewriterPart = {
  text: string;
  brand?: boolean;
};

const TRAILING_PUNCTUATION = /[?.!,;:，。？！、]+$/u;

function stripTrailingPunctuation(text: string): string {
  return text.replace(TRAILING_PUNCTUATION, "").trim();
}

function wordsOf(text: string): HeadlineTypewriterPart[] {
  const trimmed = stripTrailingPunctuation(text);
  if (!trimmed) return [];
  return trimmed
    .split(/\s+/)
    .map((word) => ({ text: stripTrailingPunctuation(word) }))
    .filter((part) => part.text.length > 0);
}

export function headlineTypewriterParts(
  headline: WelcomeHeadline,
  t: (key: string) => string,
): HeadlineTypewriterPart[] {
  const brand: HeadlineTypewriterPart = { text: "Atmos", brand: true };

  switch (headline) {
    case "come_alive":
      return [
        ...wordsOf(t("helpers.headline.comeAlive.prefix")),
        brand,
        ...wordsOf(t("helpers.headline.questionMark")),
      ];
    case "spin_up_next":
      return [
        ...wordsOf(t("helpers.headline.spinUpNext.prefix")),
        brand,
        ...wordsOf(t("helpers.headline.spinUpNext.suffix")),
      ];
    case "start_building_with_you":
      return [
        ...wordsOf(t("helpers.headline.startBuildingWithYou.prefix")),
        brand,
        ...wordsOf(t("helpers.headline.startBuildingWithYou.suffix")),
      ];
    case "deserves_workspace":
      return [
        ...wordsOf(t("helpers.headline.deservesWorkspace.prefix")),
        brand,
        ...wordsOf(t("helpers.headline.deservesWorkspace.suffix")),
      ];
  }
}
