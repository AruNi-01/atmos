"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  getFileIconProps,
} from "@workspace/ui";
import {
  ArrowBigUp,
  Bot,
  Check,
  ChevronDown,
  Clapperboard,
  CircleDot,
  CloudDownload,
  Command,
  Ellipsis,
  Eye,
  ExternalLink,
  Files,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequestArrow,
  Github,
  Loader2,
  LoaderCircle,
  Plus,
  RotateCw,
  Sparkles,
} from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import dynamic from "next/dynamic";
import Fuse from "fuse.js";
import { AtmosWordmark } from "@/components/ui/AtmosWordmark";
import {
  AttachmentBar,
  type ComposerAttachment,
} from "@/components/welcome/AttachmentBar";

const PixelBlast = dynamic(
  () => import("@workspace/ui/components/ui/pixel-blast"),
  { ssr: false },
);
import {
  codeAgentCustomApi,
  functionSettingsApi,
  fsApi,
  gitApi,
  llmProvidersApi,
  type CodeAgentCustomEntry,
  type FileTreeNode,
  type GithubIssuePayload,
  type GithubPrPayload,
  type LlmProvidersFile,
  wsGithubApi,
  wsScriptApi,
} from "@/api/ws-api";
import {
  PromptComposer,
  type AtTriggerContext,
  type ComposerHandle,
} from "@/components/welcome/PromptComposer";
import { useProjectStore } from "@/hooks/use-project-store";
import { useWorkspaceCreationStore } from "@/hooks/use-workspace-creation-store";
import { useAppRouter } from "@/hooks/use-app-router";
import { useDialogStore } from "@/hooks/use-dialog-store";
import type {
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/types/types";
import {
  WorkspaceLabelDots,
  WorkspaceLabelPicker,
  WorkspacePrioritySelect,
  WorkspaceStatusSelect,
} from "@/components/layout/sidebar/workspace-metadata-controls";
import { AGENT_OPTIONS } from "@/components/wiki/AgentSelect";
import { AgentIcon } from "@/components/agent/AgentIcon";

interface WelcomePageProps {
  onAddProject?: () => void;
  onConnectAgent?: () => void;
  onClose?: () => void;
  className?: string;
}

interface RepoContext {
  owner: string;
  repo: string;
}

interface AgentMenuOption {
  id: string;
  label: string;
  command: string;
  launchCommand: string;
  iconType: "built-in" | "custom";
}

interface MentionFileCandidate {
  name: string;
  relativePath: string;
  isDir: boolean;
  isHidden: boolean;
}

type WelcomeHeadline =
  | "come_alive"
  | "spin_up_next"
  | "start_building_with_you"
  | "deserves_workspace";

const ISSUE_CACHE_TTL_MS = 5 * 60 * 1000;
const issueListCache = new Map<string, { expiresAt: number; issues: GithubIssuePayload[] }>();

function resolvePromptPlaceholders(text: string, atts: ComposerAttachment[]): string {
  return text
    .replace(/@(?:issue|pr)#\d+/g, () => ".atmos/context/requirement.md")
    .replace(/@file:([^\s]+)/g, (_match, relativePath: string) => relativePath)
    .replace(/\[#img-(\d+)\]/g, (match, n: string) => {
      const att = atts.find((a) => a.number === Number(n));
      return att ? `.atmos/attachments/${att.filename}` : match;
    });
}

function blobToBase64(blob: Blob): Promise<string> {
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

function flattenFileTreeToCandidates(
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
const prListCache = new Map<string, { expiresAt: number; prs: GithubPrPayload[] }>();
const WELCOME_HEADLINES: WelcomeHeadline[] = [
  "come_alive",
  "spin_up_next",
  "start_building_with_you",
  "deserves_workspace",
];
const DEFAULT_WELCOME_HEADLINE: WelcomeHeadline = "come_alive";
const PLACEHOLDER_TEMPLATES = [
  (project: string, agent: string) => `What should ${agent} make inside ${project}?`,
  (project: string, agent: string) => `Give ${agent} a direction for ${project}.`,
  (project: string, agent: string) => `Start something new in ${project} with ${agent}.`,
  (project: string, agent: string) => `What do you want to shape in ${project}?`,
  (project: string, agent: string) => `Let ${agent} build the next idea in ${project}.`,
  (project: string, agent: string) => `Turn a spark into something real in ${project}.`,
  (project: string, agent: string) => `What should come to life in ${project}?`,
  (project: string, agent: string) => `Begin with ${agent}. Build in ${project}.`,
] as const;

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
const promptCardNotchSurfaceStyle: React.CSSProperties = {
  clipPath: promptCardNotchClipPath,
  filter:
    "drop-shadow(0 0 0.8px color-mix(in srgb, var(--border) 58%, transparent)) drop-shadow(0 14px 34px rgba(0,0,0,0.14))",
};

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

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

function issueToWorkspaceName(issue: GithubIssuePayload): string {
  const title = issue.title.trim();
  return title ? `[issue#${issue.number}] ${title}` : `[issue#${issue.number}]`;
}

function issueToBranchName(issue: GithubIssuePayload): string {
  return `issue-${issue.number}-${getRandomPokemonName()}`;
}

function prToWorkspaceName(pr: GithubPrPayload): string {
  const title = pr.title.trim();
  return title ? `[PR#${pr.number}] ${title}` : `[PR#${pr.number}]`;
}

function regeneratePokemonSuffixBranch(branchName: string, issueNumber?: number): string {
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

function resolveWorkspaceIssueTodoProvider(
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

function sanitizeCreateWorkspaceErrorMessage(message: string): string {
  return message
    .replace(/^\[error\]\s*/i, "")
    .replace(/^validation error:\s*/i, "")
    .trim();
}

function isBranchConflictError(message: string): boolean {
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

function isAutoGeneratedBranchConflictError(message: string): boolean {
  return message.toLowerCase().includes("auto-generated workspace directory name");
}

function renderHeadline(headline: WelcomeHeadline) {
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

const WelcomePage: React.FC<WelcomePageProps> = ({
  onAddProject,
  onConnectAgent,
  onClose,
  className,
}) => {
  const [isMounted, setIsMounted] = React.useState(false);
  const router = useAppRouter();
  const selectedProjectIdFromLauncher = useDialogStore((s) => s.selectedProjectId);
  const projects = useProjectStore((s) => s.projects);
  const addWorkspace = useProjectStore((s) => s.addWorkspace);
  const workspaceLabels = useProjectStore((s) => s.workspaceLabels);
  const createWorkspaceLabel = useProjectStore((s) => s.createWorkspaceLabel);
  const showCreating = useWorkspaceCreationStore((s) => s.showCreating);
  const showOpening = useWorkspaceCreationStore((s) => s.showOpening);
  const queueAgentRun = useWorkspaceCreationStore((s) => s.queueAgentRun);
  const clearWorkspaceCreationOverlay = useWorkspaceCreationStore((s) => s.clear);

  const [projectId, setProjectId] = React.useState("");
  const [initialRequirement, setInitialRequirement] = React.useState("");
  const composerRef = React.useRef<ComposerHandle | null>(null);
  const [attachments, setAttachments] = React.useState<ComposerAttachment[]>([]);
  const attachmentCounterRef = React.useRef(0);
  const [mentionPopover, setMentionPopover] = React.useState<{
    top: number;
    left: number;
    atOffset: number;
    query: string;
  } | null>(null);
  const [projectTreeEntries, setProjectTreeEntries] = React.useState<MentionFileCandidate[]>([]);
  const [debouncedMentionQuery, setDebouncedMentionQuery] = React.useState("");
  const [isMentionFilesLoading, setIsMentionFilesLoading] = React.useState(false);
  const [activeMentionFileIndex, setActiveMentionFileIndex] = React.useState(0);
  const mentionPopoverListRef = React.useRef<HTMLDivElement | null>(null);
  const mentionItemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [previewAttachment, setPreviewAttachment] = React.useState<ComposerAttachment | null>(null);
  const [name, setName] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [baseBranch, setBaseBranch] = React.useState("main");
  const [baseBranchFilter, setBaseBranchFilter] = React.useState("");
  const [remoteBranches, setRemoteBranches] = React.useState<string[]>([]);
  const [isBaseBranchOpen, setIsBaseBranchOpen] = React.useState(false);

  const [priority, setPriority] = React.useState<WorkspacePriority>("no_priority");
  const [workflowStatus, setWorkflowStatus] =
    React.useState<WorkspaceWorkflowStatus>("in_progress");
  const [selectedLabels, setSelectedLabels] = React.useState<WorkspaceLabel[]>([]);

  const [issueUrl, setIssueUrl] = React.useState("");
  const [selectedIssueNumber, setSelectedIssueNumber] = React.useState("");
  const [issuePreview, setIssuePreview] = React.useState<GithubIssuePayload | null>(null);
  const [issues, setIssues] = React.useState<GithubIssuePayload[]>([]);
  const [prUrl, setPrUrl] = React.useState("");
  const [selectedPrNumber, setSelectedPrNumber] = React.useState("");
  const [prPreview, setPrPreview] = React.useState<GithubPrPayload | null>(null);
  const [prs, setPrs] = React.useState<GithubPrPayload[]>([]);
  const [prError, setPrError] = React.useState<string | null>(null);
  const [isPrsLoading, setIsPrsLoading] = React.useState(false);
  const [isPrPreviewLoading, setIsPrPreviewLoading] = React.useState(false);
  const [repoContext, setRepoContext] = React.useState<RepoContext | null>(null);
  const [issueError, setIssueError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [branchError, setBranchError] = React.useState<string | null>(null);
  const [hasSetupScript, setHasSetupScript] = React.useState(false);
  const [autoExtractTodos, setAutoExtractTodos] = React.useState(false);
  const [autoExtractTodosPr, setAutoExtractTodosPr] = React.useState(false);
  const [linkType, setLinkType] = React.useState<"none" | "issue" | "pr">("none");
  const [displayedLinkType, setDisplayedLinkType] = React.useState<"issue" | "pr">("issue");
  React.useEffect(() => {
    if (linkType !== "none") setDisplayedLinkType(linkType);
  }, [linkType]);
  const [todoProviderLabel, setTodoProviderLabel] = React.useState<string | null>(null);

  const [isBaseBranchesLoading, setIsBaseBranchesLoading] = React.useState(false);
  const [isIssuesLoading, setIsIssuesLoading] = React.useState(false);
  const [isIssuePreviewLoading, setIsIssuePreviewLoading] = React.useState(false);
  const [isLlmRoutingLoading, setIsLlmRoutingLoading] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = React.useState(false);

  const [agentCustomSettings, setAgentCustomSettings] = React.useState<
    Record<string, { cmd?: string; flags?: string; enabled?: boolean }>
  >({});
  const [customAgents, setCustomAgents] = React.useState<CodeAgentCustomEntry[]>([]);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string>("codex");
  const [headline, setHeadline] = React.useState<WelcomeHeadline>(DEFAULT_WELCOME_HEADLINE);

  const nameTouchedRef = React.useRef(false);
  const branchTouchedRef = React.useRef(false);
  const generatedBranchRef = React.useRef<string | null>(null);
  const branchInputRef = React.useRef<HTMLInputElement | null>(null);
  const prevProjectIdsRef = React.useRef<string[]>([]);
  const waitingForNewProjectRef = React.useRef(false);


  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  React.useEffect(() => {
    setHeadline(WELCOME_HEADLINES[Math.floor(Math.random() * WELCOME_HEADLINES.length)]);
  }, []);



  React.useEffect(() => {
    if (selectedProjectIdFromLauncher && projects.some((project) => project.id === selectedProjectIdFromLauncher)) {
      setProjectId(selectedProjectIdFromLauncher);
      return;
    }
    if (!projectId && projects.length > 0) {
      setProjectId(projects[0].id);
    }
  }, [projects, selectedProjectIdFromLauncher, projectId]);

  React.useEffect(() => {
    const previousIds = prevProjectIdsRef.current;
    const currentIds = projects.map((project) => project.id);

    if (waitingForNewProjectRef.current && previousIds.length > 0) {
      const newProject = projects.find((project) => !previousIds.includes(project.id));
      if (newProject) {
        setProjectId(newProject.id);
        waitingForNewProjectRef.current = false;
      }
    }

    prevProjectIdsRef.current = currentIds;
  }, [projects]);

  const selectedProject = React.useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projectId, projects],
  );
  const selectedProjectId = selectedProject?.id ?? null;
  const selectedProjectPath = selectedProject?.mainFilePath ?? null;

  React.useEffect(() => {
    if (!selectedProjectPath) {
      setProjectTreeEntries([]);
      setIsMentionFilesLoading(false);
      return;
    }

    let cancelled = false;
    setIsMentionFilesLoading(true);
    fsApi
      .listProjectFiles(selectedProjectPath, { showHidden: true })
      .then((res) => {
        if (cancelled) return;
        setProjectTreeEntries(flattenFileTreeToCandidates(res.tree));
      })
      .catch(() => {
        if (!cancelled) setProjectTreeEntries([]);
      })
      .finally(() => {
        if (!cancelled) setIsMentionFilesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectPath]);

  React.useEffect(() => {
    if (!mentionPopover) {
      setDebouncedMentionQuery("");
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedMentionQuery(mentionPopover.query.trim());
    }, 500);
    return () => clearTimeout(timer);
  }, [mentionPopover]);

  const mentionFileFuse = React.useMemo(
    () =>
      new Fuse(projectTreeEntries, {
        keys: [
          { name: "name", weight: 0.68 },
          { name: "relativePath", weight: 0.32 },
        ],
        threshold: 0.32,
        ignoreLocation: true,
      }),
    [projectTreeEntries],
  );

  const mentionFiles = React.useMemo(() => {
    const query = debouncedMentionQuery;
    if (!query) return [] as MentionFileCandidate[];
    const hits = mentionFileFuse.search(query, { limit: 60 }).map((r) => r.item);
    return hits
      .sort((a, b) => {
        const bucket = (item: MentionFileCandidate) =>
          item.isHidden ? 2 : item.isDir ? 1 : 0;
        const bucketDiff = bucket(a) - bucket(b);
        if (bucketDiff !== 0) return bucketDiff;
        return a.relativePath.localeCompare(b.relativePath);
      })
      .slice(0, 12);
  }, [debouncedMentionQuery, mentionFileFuse]);

  const selectMentionFile = React.useCallback(
    (item: MentionFileCandidate) => {
      const popover = mentionPopover;
      if (!popover) return;
      composerRef.current?.applyMentionAtRange(
        popover.atOffset,
        popover.query.length,
        { kind: "file", relativePath: item.relativePath },
      );
      setMentionPopover(null);
    },
    [mentionPopover],
  );

  type MentionNavItem =
    | { type: "issue"; issue: GithubIssuePayload }
    | { type: "pr"; pr: GithubPrPayload }
    | { type: "file"; file: MentionFileCandidate };

  const mentionNavItems = React.useMemo<MentionNavItem[]>(() => {
    const items: MentionNavItem[] = [];
    if (issuePreview) items.push({ type: "issue", issue: issuePreview });
    if (prPreview) items.push({ type: "pr", pr: prPreview });
    for (const file of mentionFiles) items.push({ type: "file", file });
    return items;
  }, [issuePreview, prPreview, mentionFiles]);

  const selectMentionNavItem = React.useCallback(
    (item: MentionNavItem) => {
      const popover = mentionPopover;
      if (!popover) return;
      if (item.type === "file") {
        selectMentionFile(item.file);
        return;
      }
      if (item.type === "issue") {
        composerRef.current?.applyMentionAtRange(
          popover.atOffset,
          popover.query.length,
          { kind: "issue", number: item.issue.number },
        );
        setMentionPopover(null);
        return;
      }
      if (item.type === "pr") {
        composerRef.current?.applyMentionAtRange(
          popover.atOffset,
          popover.query.length,
          { kind: "pr", number: item.pr.number },
        );
        setMentionPopover(null);
      }
    },
    [mentionPopover, selectMentionFile],
  );

  React.useEffect(() => {
    setActiveMentionFileIndex(0);
  }, [mentionPopover?.query, mentionNavItems.length]);

  React.useEffect(() => {
    if (!mentionPopover) return;
    const container = mentionPopoverListRef.current;
    const activeItem = mentionItemRefs.current[activeMentionFileIndex];
    if (!container || !activeItem) return;
    activeItem.scrollIntoView({ block: "nearest" });
  }, [activeMentionFileIndex, mentionPopover]);

  React.useEffect(() => {
    if (!mentionPopover) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        if (mentionNavItems.length === 0) return;
        event.preventDefault();
        setActiveMentionFileIndex((prev) => (prev + 1) % mentionNavItems.length);
        return;
      }
      if (event.key === "ArrowUp") {
        if (mentionNavItems.length === 0) return;
        event.preventDefault();
        setActiveMentionFileIndex(
          (prev) => (prev - 1 + mentionNavItems.length) % mentionNavItems.length,
        );
        return;
      }
      if (event.key === "Enter") {
        const item = mentionNavItems[activeMentionFileIndex];
        if (!item) return;
        event.preventDefault();
        selectMentionNavItem(item);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeMentionFileIndex, mentionNavItems, mentionPopover, selectMentionNavItem]);

  React.useEffect(() => {
    Promise.all([functionSettingsApi.get(), codeAgentCustomApi.get()])
      .then(([settings, customData]) => {
        const saved = (settings as Record<string, unknown>)?.agent_cli as
          | Record<string, unknown>
          | undefined;
        const allAgents = Array.isArray(customData?.agents) ? customData.agents : [];
        const builtInEntries = allAgents.filter((agent) =>
          AGENT_OPTIONS.some((option) => option.id === agent.id),
        );
        setAgentCustomSettings(
          Object.fromEntries(
            builtInEntries.map((agent) => [
              agent.id,
              { cmd: agent.cmd, flags: agent.flags, enabled: agent.enabled !== false },
            ]),
          ),
        );
        setCustomAgents(
          allAgents.filter(
            (agent) =>
              !AGENT_OPTIONS.some((option) => option.id === agent.id) &&
              !!agent.label &&
              !!agent.cmd &&
              agent.enabled !== false,
          ),
        );
        const savedAgentId = typeof saved?.center_fix_terminal_default_agent === "string"
          ? saved.center_fix_terminal_default_agent
          : null;
        if (savedAgentId) {
          setSelectedAgentId(savedAgentId);
        }
      })
      .catch(() => {});
  }, []);

  const availableAgents = React.useMemo<AgentMenuOption[]>(
    () => [
      ...AGENT_OPTIONS.filter((agent) => agentCustomSettings[agent.id]?.enabled ?? true).map(
        (agent) => {
          const command = agentCustomSettings[agent.id]?.cmd?.trim() || agent.cmd;
          const flags = agentCustomSettings[agent.id]?.flags?.trim() || agent.params || "";
          return {
            id: agent.id,
            label: agent.label,
            command,
            launchCommand: flags ? `${command} ${flags}` : command,
            iconType: "built-in" as const,
          };
        },
      ),
      ...customAgents.map((agent) => {
        const command = agent.cmd.trim();
        const flags = agent.flags?.trim() || "";
        return {
          id: agent.id,
          label: agent.label,
          command,
          launchCommand: flags ? `${command} ${flags}` : command,
          iconType: "custom" as const,
        };
      }),
    ],
    [agentCustomSettings, customAgents],
  );

  const selectedAgent =
    availableAgents.find((agent) => agent.id === selectedAgentId) ?? availableAgents[0] ?? null;

  React.useEffect(() => {
    if (!selectedAgent && availableAgents.length > 0) {
      setSelectedAgentId(availableAgents[0].id);
    }
  }, [availableAgents, selectedAgent]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadLlmRouting() {
      setIsLlmRoutingLoading(true);
      try {
        const config = await llmProvidersApi.get();
        if (cancelled) return;
        const provider = resolveWorkspaceIssueTodoProvider(config);
        setTodoProviderLabel(provider?.label ?? null);
      } catch {
        if (!cancelled) setTodoProviderLabel(null);
      } finally {
        if (!cancelled) setIsLlmRoutingLoading(false);
      }
    }

    void loadLlmRouting();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function loadProjectContext() {
      if (!selectedProjectId || !selectedProjectPath) return;

      setIsBaseBranchesLoading(true);
      setIssueError(null);
      setRepoContext(null);
      setRemoteBranches([]);
      setIssues([]);
      setIssuePreview(null);
      setSelectedIssueNumber("");
      setIssueUrl("");
      setPrs([]);
      setPrPreview(null);
      setSelectedPrNumber("");
      setPrUrl("");
      setPrError(null);
      setHasSetupScript(false);
      setName("");
      setBranch("");
      setAutoExtractTodos(false);
      setAutoExtractTodosPr(false);
      setLinkType("none");
      setBranchError(null);
      setSubmitError(null);
      setAttachments((prev) => {
        prev.forEach((a) => URL.revokeObjectURL(a.objectUrl));
        return [];
      });
      attachmentCounterRef.current = 0;
      composerRef.current?.clear();
      nameTouchedRef.current = false;
      branchTouchedRef.current = false;
      generatedBranchRef.current = null;

      try {
        const fetchedRemoteBranches = await gitApi.listRemoteBranches(selectedProjectPath);
        if (!cancelled) {
          const nextRemoteBranches = fetchedRemoteBranches.sort();
          setRemoteBranches(nextRemoteBranches);
          if (nextRemoteBranches.includes("main")) {
            setBaseBranch("main");
          } else if (nextRemoteBranches.length > 0) {
            setBaseBranch(nextRemoteBranches[0]);
          } else {
            setBaseBranch("main");
          }
        }

        const scripts = await wsScriptApi.get(selectedProjectId);
        if (!cancelled) {
          setHasSetupScript(typeof scripts.setup === "string" && scripts.setup.trim().length > 0);
        }

        const status = await gitApi.getStatus(selectedProjectPath);
        if (cancelled) return;

        if (status.github_owner && status.github_repo) {
          const nextContext = {
            owner: status.github_owner,
            repo: status.github_repo,
          };
          setRepoContext(nextContext);

          const cacheKey = `${nextContext.owner}/${nextContext.repo}`;
          const cachedIssues = issueListCache.get(cacheKey);
          if (cachedIssues && cachedIssues.expiresAt > Date.now()) {
            setIssues(cachedIssues.issues);
          } else {
            setIsIssuesLoading(true);
            const fetchedIssues = await wsGithubApi.listIssues(nextContext);
            if (cancelled) return;
            setIssues(fetchedIssues);
            issueListCache.set(cacheKey, {
              expiresAt: Date.now() + ISSUE_CACHE_TTL_MS,
              issues: fetchedIssues,
            });
          }

          const cachedPrs = prListCache.get(cacheKey);
          if (cachedPrs && cachedPrs.expiresAt > Date.now()) {
            setPrs(cachedPrs.prs);
          } else {
            setIsPrsLoading(true);
            try {
              const fetchedPrs = await wsGithubApi.listPrs(nextContext);
              if (cancelled) return;
              setPrs(fetchedPrs);
              prListCache.set(cacheKey, {
                expiresAt: Date.now() + ISSUE_CACHE_TTL_MS,
                prs: fetchedPrs,
              });
            } catch (error) {
              if (!cancelled) {
                setPrError(
                  error instanceof Error ? error.message : "Failed to load GitHub PRs",
                );
              }
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setIssueError(error instanceof Error ? error.message : "Failed to load project context");
        }
      } finally {
        if (!cancelled) {
          setIsBaseBranchesLoading(false);
          setIsIssuesLoading(false);
          setIsPrsLoading(false);
        }
      }
    }

    void loadProjectContext();
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, selectedProjectPath]);

  React.useEffect(() => {
    if (!issuePreview) {
      if (!prPreview) {
        generatedBranchRef.current = null;
      }
      return;
    }

    if (!nameTouchedRef.current) {
      setName(issueToWorkspaceName(issuePreview));
    }
    if (!branchTouchedRef.current) {
      const generated = issueToBranchName(issuePreview);
      generatedBranchRef.current = generated;
      setBranch(generated);
    }
  }, [issuePreview, prPreview]);

  React.useEffect(() => {
    if (!prPreview) return;

    if (!nameTouchedRef.current) {
      setName(prToWorkspaceName(prPreview));
    }
    // PR-linked workspaces always reuse the PR head branch.
    setBranch(prPreview.head_ref);
    if (prPreview.base_ref) {
      setBaseBranch(prPreview.base_ref);
    }
  }, [prPreview]);

  React.useEffect(() => {
    if (!issuePreview || !todoProviderLabel) {
      setAutoExtractTodos(false);
    }
  }, [issuePreview, todoProviderLabel]);

  React.useEffect(() => {
    if (!prPreview || !todoProviderLabel) {
      setAutoExtractTodosPr(false);
    }
  }, [prPreview, todoProviderLabel]);

  const composerPlaceholder = React.useMemo(() => {
    const projectName = selectedProject?.name?.trim() || "Specified Project";
    const agentName = selectedAgent?.label?.trim() || "Code Agent";
    const templateIndex =
      hashString(`${projectName}:${agentName}`) % PLACEHOLDER_TEMPLATES.length;

    return PLACEHOLDER_TEMPLATES[templateIndex](projectName, agentName);
  }, [selectedAgent?.label, selectedProject?.name]);
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

  const filteredRemoteBranches = React.useMemo(
    () =>
      remoteBranches.filter((remoteBranch) =>
        remoteBranch.toLowerCase().includes(baseBranchFilter.trim().toLowerCase()),
      ),
    [baseBranchFilter, remoteBranches],
  );
  const hasGithubContext = !!issuePreview || !!prPreview;
  const canAutoExtractTodosIssue = !!issuePreview && !!todoProviderLabel && !isLlmRoutingLoading;
  const canAutoExtractTodosPr = !!prPreview && !!todoProviderLabel && !isLlmRoutingLoading;
  const canAutoExtractTodos = canAutoExtractTodosIssue || canAutoExtractTodosPr;
  const buildAutoExtractDescription = (kind: "issue" | "pr") => {
    const hasPreview = kind === "issue" ? !!issuePreview : !!prPreview;
    if (!hasPreview) return `Import a GitHub ${kind === "pr" ? "PR" : "issue"} first.`;
    if (isLlmRoutingLoading) return "Checking LLM routing...";
    if (todoProviderLabel)
      return `Uses ${todoProviderLabel} to extract an initial task checklist from the ${kind === "pr" ? "PR" : "issue"} description.`;
    return "Configure LLM Providers > Routing > Workspace issue TODO extraction first.";
  };
  const autoExtractDescriptionIssue = buildAutoExtractDescription("issue");
  const autoExtractDescriptionPr = buildAutoExtractDescription("pr");
  const filledSummaryItems = React.useMemo(() => {
    const items: Array<{
      key:
        | "display-name"
        | "base-branch"
        | "workspace-branch"
        | "github-issue"
        | "github-pr"
        | "auto-todos";
      value: string;
      title: string;
    }> = [];
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
    const autoTodosOn =
      (issuePreview && autoExtractTodos) || (prPreview && autoExtractTodosPr);
    if (autoTodosOn && canAutoExtractTodos) {
      items.push({
        key: "auto-todos",
        value: "TODOs",
        title: "Auto-extract TODOs with LLM: on",
      });
    }

    return items;
  }, [autoExtractTodos, autoExtractTodosPr, baseBranch, branch, canAutoExtractTodos, issuePreview, prPreview, name]);

  const renderSummaryIcon = (key: (typeof filledSummaryItems)[number]["key"]) => {
    switch (key) {
      case "display-name":
        return <Eye className="size-3 shrink-0" />;
      case "base-branch":
        return <GitBranch className="size-3 shrink-0" />;
      case "workspace-branch":
        return <GitCommitHorizontal className="size-3 shrink-0" />;
      case "github-issue":
        return <Github className="size-3 shrink-0" />;
      case "github-pr":
        return <GitPullRequestArrow className="size-3 shrink-0" />;
      case "auto-todos":
        return <Sparkles className="size-3 shrink-0" />;
    }
  };

  const clearPrSelection = () => {
    setPrPreview(null);
    setSelectedPrNumber("");
    setPrUrl("");
    setPrError(null);
    setAutoExtractTodosPr(false);
  };

  const clearIssueSelection = () => {
    setIssuePreview(null);
    setSelectedIssueNumber("");
    setIssueUrl("");
    setIssueError(null);
    setAutoExtractTodos(false);
  };

  const handleSelectLinkType = (next: "issue" | "pr") => {
    if (linkType === next) {
      setLinkType("none");
      if (next === "issue") clearIssueSelection();
      else clearPrSelection();
      return;
    }
    setLinkType(next);
    if (next === "issue") clearPrSelection();
    else clearIssueSelection();
  };

  const handleSelectIssue = (value: string) => {
    setSelectedIssueNumber(value);
    setIssueUrl("");
    setIssueError(null);
    setBranchError(null);
    setSubmitError(null);
    setIssuePreview(issues.find((issue) => String(issue.number) === value) ?? null);
    clearPrSelection();
  };

  const handleSelectPr = (value: string) => {
    setSelectedPrNumber(value);
    setPrUrl("");
    setPrError(null);
    setBranchError(null);
    setSubmitError(null);
    setPrPreview(prs.find((pr) => String(pr.number) === value) ?? null);
    clearIssueSelection();
  };

  const handleLoadPrFromUrl = async () => {
    if (!prUrl.trim()) {
      setPrError(null);
      return;
    }

    setIsPrPreviewLoading(true);
    setPrError(null);
    setBranchError(null);
    setSubmitError(null);
    setSelectedPrNumber("");

    try {
      const preview = await wsGithubApi.getPr({ prUrl: prUrl.trim() });
      const currentRepo = repoContext ? `${repoContext.owner}/${repoContext.repo}` : null;
      const previewRepo = `${preview.owner}/${preview.repo}`;

      if (currentRepo && currentRepo !== previewRepo) {
        setPrPreview(null);
        setPrError(`PR belongs to ${previewRepo}, but current project is ${currentRepo}.`);
        return;
      }

      setPrPreview(preview);
      clearIssueSelection();
    } catch (error) {
      setPrPreview(null);
      setPrError(error instanceof Error ? error.message : "Failed to load PR preview");
    } finally {
      setIsPrPreviewLoading(false);
    }
  };

  const handleRefreshPrs = async () => {
    if (!repoContext) return;
    setIsPrsLoading(true);
    setPrError(null);
    try {
      const cacheKey = `${repoContext.owner}/${repoContext.repo}`;
      prListCache.delete(cacheKey);
      const fetchedPrs = await wsGithubApi.listPrs(repoContext);
      setPrs(fetchedPrs);
      prListCache.set(cacheKey, {
        expiresAt: Date.now() + ISSUE_CACHE_TTL_MS,
        prs: fetchedPrs,
      });
    } catch (error) {
      setPrError(error instanceof Error ? error.message : "Failed to refresh GitHub PRs");
    } finally {
      setIsPrsLoading(false);
    }
  };

  const handleLoadIssueFromUrl = async () => {
    if (!issueUrl.trim()) {
      setIssueError(null);
      return;
    }

    setIsIssuePreviewLoading(true);
    setIssueError(null);
    setBranchError(null);
    setSubmitError(null);
    setSelectedIssueNumber("");

    try {
      const preview = await wsGithubApi.getIssue({ issueUrl: issueUrl.trim() });
      const currentRepo = repoContext ? `${repoContext.owner}/${repoContext.repo}` : null;
      const previewRepo = `${preview.owner}/${preview.repo}`;

      if (currentRepo && currentRepo !== previewRepo) {
        setIssuePreview(null);
        setIssueError(`Issue belongs to ${previewRepo}, but current project is ${currentRepo}.`);
        return;
      }

      setIssuePreview(preview);
      clearPrSelection();
    } catch (error) {
      setIssuePreview(null);
      setIssueError(error instanceof Error ? error.message : "Failed to load issue preview");
    } finally {
      setIsIssuePreviewLoading(false);
    }
  };

  const handleRefreshIssues = async () => {
    if (!repoContext) return;
    setIsIssuesLoading(true);
    setIssueError(null);
    try {
      const cacheKey = `${repoContext.owner}/${repoContext.repo}`;
      issueListCache.delete(cacheKey);
      const fetchedIssues = await wsGithubApi.listIssues(repoContext);
      setIssues(fetchedIssues);
      issueListCache.set(cacheKey, {
        expiresAt: Date.now() + ISSUE_CACHE_TTL_MS,
        issues: fetchedIssues,
      });
    } catch (error) {
      setIssueError(error instanceof Error ? error.message : "Failed to refresh GitHub issues");
    } finally {
      setIsIssuesLoading(false);
    }
  };

  const handleRegenerateBranch = () => {
    const nextBranch = regeneratePokemonSuffixBranch(branch, issuePreview?.number);
    branchTouchedRef.current = true;
    setBranch(nextBranch);
    setBranchError(null);
    setSubmitError(null);
    requestAnimationFrame(() => branchInputRef.current?.focus());
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    if (!projectId) {
      setSubmitError("Select a project first.");
      return;
    }

    let keepGlobalLoading = false;
    setIsSubmitting(true);
    setSubmitError(null);
    setBranchError(null);
    showCreating();

    try {
      const finalDisplayName = prPreview
        ? name.trim() || prToWorkspaceName(prPreview)
        : name.trim() || (issuePreview ? issueToWorkspaceName(issuePreview) : "");
      const finalBranch = prPreview
        ? prPreview.head_ref
        : branch.trim() ||
          (!branchTouchedRef.current && generatedBranchRef.current) ||
          (issuePreview ? issueToBranchName(issuePreview) : "");
      const finalBaseBranch = prPreview ? prPreview.base_ref || baseBranch : baseBranch;

      // Create labels from GitHub issue/PR if present
      let labelsToUse = selectedLabels;
      if (prPreview && prPreview.labels && prPreview.labels.length > 0) {
        const source = 'gitHub_pr' as const;
        for (const prLabel of prPreview.labels) {
          // Check if label already exists with same name (case-insensitive) and source
          const existingLabel = workspaceLabels.find(
            (l) => l.name.toLowerCase() === prLabel.name.toLowerCase() && l.source === source
          );
          if (!existingLabel) {
            const newLabel = await createWorkspaceLabel({
              name: prLabel.name,
              color: prLabel.color ? `#${prLabel.color.replace(/^#/, '')}` : '#94a3b8',
              source,
            });
            labelsToUse = [...labelsToUse, newLabel];
          } else if (!labelsToUse.find((l) => l.id === existingLabel.id)) {
            labelsToUse = [...labelsToUse, existingLabel];
          }
        }
      } else if (issuePreview && issuePreview.labels && issuePreview.labels.length > 0) {
        const source = 'gitHub_issue' as const;
        for (const issueLabel of issuePreview.labels) {
          // Check if label already exists with same name (case-insensitive) and source
          const existingLabel = workspaceLabels.find(
            (l) => l.name.toLowerCase() === issueLabel.name.toLowerCase() && l.source === source
          );
          if (!existingLabel) {
            const newLabel = await createWorkspaceLabel({
              name: issueLabel.name,
              color: issueLabel.color ? `#${issueLabel.color.replace(/^#/, '')}` : '#94a3b8',
              source,
            });
            labelsToUse = [...labelsToUse, newLabel];
          } else if (!labelsToUse.find((l) => l.id === existingLabel.id)) {
            labelsToUse = [...labelsToUse, existingLabel];
          }
        }
      }

      const rawPrompt = composerRef.current?.getText() ?? initialRequirement;
      const resolvedPrompt = resolvePromptPlaceholders(rawPrompt, attachments);
      const attachmentPayload = await Promise.all(
        attachments.map(async (a) => ({
          filename: a.filename,
          mime: a.blob.type || "application/octet-stream",
          dataBase64: await blobToBase64(a.blob),
        })),
      );

      const workspaceId = await addWorkspace({
        projectId,
        name: finalBranch,
        displayName: finalDisplayName || null,
        branch: finalBranch,
        baseBranch: finalBaseBranch,
        initialRequirement: resolvedPrompt.trim() || null,
        githubIssue: prPreview ? null : issuePreview,
        githubPr: prPreview,
        autoExtractTodos:
          !!todoProviderLabel &&
          ((prPreview && autoExtractTodosPr) || (!prPreview && !!issuePreview && autoExtractTodos)),
        hasSetupScript,
        priority,
        workflowStatus,
        labels: labelsToUse,
        attachments: attachmentPayload,
      });
      queueAgentRun({
        workspaceId,
        prompt: resolvedPrompt.trim() || finalDisplayName || finalBranch,
        agent: selectedAgent
          ? {
              id: selectedAgent.id,
              label: selectedAgent.label,
              command: selectedAgent.launchCommand,
              iconType: selectedAgent.iconType,
            }
          : undefined,
      });

      keepGlobalLoading = true;
      showOpening(workspaceId);
      // Clean up composer + attachments after successful create.
      setAttachments((prev) => {
        prev.forEach((a) => URL.revokeObjectURL(a.objectUrl));
        return [];
      });
      attachmentCounterRef.current = 0;
      composerRef.current?.clear();
      router.push(`/workspace?id=${workspaceId}`);
    } catch (error) {
      clearWorkspaceCreationOverlay();
      const message = sanitizeCreateWorkspaceErrorMessage(
        error instanceof Error ? error.message : "Failed to create workspace",
      );

      if (isBranchConflictError(message)) {
        setBranchError(message);
        setIsAdvancedOpen(true);
        requestAnimationFrame(() => branchInputRef.current?.focus());
      } else {
        setSubmitError(message);
      }
    } finally {
      if (!keepGlobalLoading) {
        setIsSubmitting(false);
      }
    }
  };

  const disabledSubmit =
    isSubmitting ||
    !projectId ||
    isIssuePreviewLoading ||
    isBaseBranchesLoading ||
    (selectedProjectId ? remoteBranches.length === 0 : false);

  useHotkeys('mod+shift+enter', () => {
    if (!disabledSubmit) {
      handleSubmit();
    }
  }, {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
    description: 'Create workspace',
  });

  if (!isMounted) {
    return (
      <div
        className={cn(
          "min-h-full overflow-hidden bg-background px-4 py-8 selection:bg-foreground/10 sm:px-6",
          className,
        )}
      >
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center py-8">
          <div className="mb-10 flex w-full max-w-4xl justify-center">
            <div className="h-16 w-[min(92vw,980px)] animate-pulse rounded-2xl bg-muted/40 sm:h-20 md:h-24" />
          </div>

          <div className="w-full max-w-4xl rounded-2xl border border-border/60 bg-background p-4 shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-md sm:p-6">
            <div className="h-[88px] w-full animate-pulse rounded-xl bg-muted/35" />

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div className="h-9 w-28 animate-pulse rounded-full bg-muted/35" />
                <div className="h-9 w-56 animate-pulse rounded-full bg-muted/35" />
              </div>
              <div className="h-12 w-12 animate-pulse rounded-full bg-muted/35" />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/50 px-1 pt-4">
              <div className="h-9 w-28 animate-pulse rounded-full bg-muted/35" />
              <div className="h-9 w-32 animate-pulse rounded-full bg-muted/35" />
              <div className="h-9 w-24 animate-pulse rounded-full bg-muted/35" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative min-h-full overflow-hidden bg-background px-4 py-8 selection:bg-foreground/10 sm:px-6",
        className,
      )}
    >
      <div className="absolute inset-0 z-0">
        <PixelBlast
          variant="circle"
          pixelSize={6}
          color="#999999"
          patternScale={3}
          patternDensity={1}
          pixelSizeJitter={0.5}
          enableRipples
          rippleSpeed={0.2}
          rippleThickness={0.12}
          rippleIntensityScale={1}
          speed={0.2}
          edgeFade={0.25}
          centerFade={0.85}
          centerRadius={0.45}
          transparent
        />
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="group absolute left-1/2 top-0 z-20 -translate-x-1/2 flex cursor-pointer flex-col items-center gap-0 px-6 py-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
          aria-label="Close"
        >
          <ChevronDown className="h-5 w-9 animate-[bounce-down_1.6s_ease-in-out_infinite]" strokeWidth={1.2} />
          <ChevronDown className="h-5 w-9 -mt-2.5 animate-[bounce-down_1.6s_ease-in-out_0.15s_infinite]" strokeWidth={1.2} />
        </button>
      )}
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center py-8 md:translate-y-8">
        <div className="mb-10 flex w-full max-w-4xl flex-col items-center">
          <h1 className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            {renderHeadline(headline)}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="w-full max-w-4xl">
          <div className="relative">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="absolute -left-3 -top-3 z-20 inline-flex size-10 cursor-pointer items-center justify-center rounded-lg border border-border/60 bg-background text-foreground/90 shadow-[0_6px_20px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Select agent"
                >
                  {selectedAgent?.iconType === "built-in" ? (
                    <AgentIcon registryId={selectedAgent.id} name={selectedAgent.label} size={18} />
                  ) : (
                    <Bot className="size-4 text-muted-foreground" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56">
                {availableAgents.length > 0 ? (
                  availableAgents.map((agent) => (
                    <DropdownMenuItem
                      key={agent.id}
                      onClick={() => {
                        setSelectedAgentId(agent.id);
                        functionSettingsApi
                          .update("agent_cli", "center_fix_terminal_default_agent", agent.id)
                          .catch(() => {});
                      }}
                      className="cursor-pointer justify-between gap-3"
                    >
                      <span className="flex items-center gap-2">
                        {agent.iconType === "built-in" ? (
                          <AgentIcon registryId={agent.id} name={agent.label} size={16} />
                        ) : (
                          <Bot className="size-4 text-muted-foreground" />
                        )}
                        {agent.label}
                      </span>
                      {agent.id === selectedAgentId ? (
                        <Check className="size-4 text-foreground" />
                      ) : null}
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem onClick={onConnectAgent} className="cursor-pointer">
                    Connect agents
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="relative overflow-visible p-1.5">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-[2rem] border border-border/50 bg-muted/20 shadow-[0_18px_50px_rgba(0,0,0,0.16)] backdrop-blur-md"
              />
              <div className="relative">
                <div
                  className="space-y-4 rounded-[1.55rem] bg-background/90 p-4 sm:p-5"
                  style={promptCardNotchSurfaceStyle}
                >
                  <PromptComposer
                    ref={composerRef}
                    placeholder={
                      <span className="flex items-baseline gap-1 overflow-hidden">
                        <span className="relative shrink-0 whitespace-nowrap">
                          {/* The entering text always sits in normal flow so the
                              container width snaps to the new text immediately at
                              t=0 of the transition — this lets the hint's slide
                              animation align with the actual layout shift instead
                              of lagging until exit cleanup. */}
                          <span
                            key={visiblePlaceholder}
                            className="welcome-placeholder-enter block whitespace-nowrap"
                          >
                            {visiblePlaceholder}
                          </span>
                          {exitingPlaceholder ? (
                            <span
                              key={`exit-${exitingPlaceholder}`}
                              className="welcome-placeholder-exit pointer-events-none absolute left-0 top-0 block whitespace-nowrap"
                            >
                              {exitingPlaceholder}
                            </span>
                          ) : null}
                        </span>
                        <span
                          key={`hint-${visiblePlaceholder}`}
                          className="welcome-placeholder-hint min-w-0 flex-1 truncate text-muted-foreground/45"
                        >
                          (@ mention context, or paste img directly)
                        </span>
                      </span>
                    }
                    onTextChange={(text) => {
                      setInitialRequirement(text);
                      setSubmitError(null);
                      // Auto-close mention popover when the triggering @ is gone; keep query in sync.
                      setMentionPopover((prev) => {
                        if (!prev) return prev;
                        if (text.length < prev.atOffset) return null;
                        if (text.charAt(prev.atOffset - 1) !== "@") return null;
                        const newQuery = text.slice(prev.atOffset);
                        const spaceIdx = newQuery.search(/\s/);
                        if (spaceIdx >= 0) return null;
                        return newQuery === prev.query ? prev : { ...prev, query: newQuery };
                      });
                      // Sync: prune attachments whose [#img-N] chip is no longer present.
                      const present = new Set<number>();
                      for (const m of text.matchAll(/\[#img-(\d+)\]/g)) {
                        present.add(Number(m[1]));
                      }
                      setAttachments((prev) => {
                        if (prev.every((a) => present.has(a.number))) return prev;
                        const survivors = prev.filter((a) => present.has(a.number));
                        prev.forEach((a) => {
                          if (!survivors.some((s) => s.id === a.id)) URL.revokeObjectURL(a.objectUrl);
                        });
                        return survivors;
                      });
                    }}
                    onImagePaste={(blob, ext) => {
                      attachmentCounterRef.current += 1;
                      const n = attachmentCounterRef.current;
                      const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "") || "png";
                      const filename = `img-${n}.${safeExt}`;
                      const att: ComposerAttachment = {
                        id: `img-${n}`,
                        number: n,
                        ext: safeExt,
                        filename,
                        blob,
                        objectUrl: URL.createObjectURL(blob),
                      };
                      setAttachments((prev) => [...prev, att]);
                      composerRef.current?.insertImagePlaceholder(n);
                    }}
                    onAtTrigger={(ctx: AtTriggerContext) => {
                      setMentionPopover({
                        top: ctx.caretRect.bottom + 4,
                        left: ctx.caretRect.left,
                        atOffset: ctx.atOffset,
                        query: ctx.query,
                      });
                    }}
                    onAtCancel={() => {
                      setMentionPopover(null);
                      setIsMentionFilesLoading(false);
                    }}
                  />

                  <AttachmentBar
                    attachments={attachments}
                    onRemove={(id) => {
                      const target = attachments.find((a) => a.id === id);
                      if (target) {
                        composerRef.current?.removeImagePlaceholder(target.number);
                      }
                    }}
                    onPreview={(att) => setPreviewAttachment(att)}
                  />

                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex h-9 min-w-[160px] items-center gap-2 rounded-md border px-3 text-sm backdrop-blur-sm transition-colors hover:bg-muted",
                              projects.length === 0
                                ? "border-dashed border-border bg-muted/25 text-muted-foreground"
                                : "border-border/60 bg-background/40 text-foreground/90",
                            )}
                          >
                            {projects.length === 0 ? (
                              <>
                                <Plus className="size-3.5 shrink-0" />
                                <span className="truncate font-medium">Add a project first</span>
                              </>
                            ) : (
                              <span className="truncate font-medium">
                                {selectedProject?.name ?? "Select project"}
                              </span>
                            )}
                            <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-56">
                          <DropdownMenuItem
                            onClick={() => {
                              waitingForNewProjectRef.current = true;
                              onAddProject?.();
                            }}
                            className="cursor-pointer font-medium"
                          >
                            Add Project
                          </DropdownMenuItem>
                          {projects.length > 0 ? (
                            <>
                              <div className="my-1 h-px bg-border/70" />
                              {projects.map((project) => (
                                <DropdownMenuItem
                                  key={project.id}
                                  onClick={() => setProjectId(project.id)}
                                  className="cursor-pointer justify-between gap-3"
                                >
                                  <span className="truncate">{project.name}</span>
                                  {project.id === projectId ? (
                                    <Check className="size-4 text-foreground" />
                                  ) : null}
                                </DropdownMenuItem>
                              ))}
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <WorkspacePrioritySelect
                        value={priority}
                        onChange={setPriority}
                        contentSide="top"
                        surface
                        triggerClassName="h-9 rounded-md border border-border/60 bg-background/25 px-3 text-muted-foreground"
                        labelClassName="font-medium text-foreground/88"
                      />
                      <WorkspaceStatusSelect
                        value={workflowStatus}
                        onChange={setWorkflowStatus}
                        contentSide="top"
                        surface
                        triggerClassName="h-9 rounded-md border border-border/60 bg-background/25 px-3 text-muted-foreground"
                        labelClassName="font-medium text-foreground/88"
                      />
                      <div className="flex items-center gap-2">
                        <WorkspaceLabelPicker
                          labels={selectedLabels}
                          availableLabels={workspaceLabels}
                          onChange={setSelectedLabels}
                          onCreateLabel={createWorkspaceLabel}
                          contentSide="top"
                          editorSide="top"
                          surface
                          triggerClassName="h-9 rounded-md border border-border/60 bg-background/25 px-3 text-muted-foreground"
                        />
                        <WorkspaceLabelDots labels={selectedLabels} overlap className="pl-1" />
                      </div>
                    </div>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="submit"
                          size="icon"
                          className="size-9 shrink-0 rounded-md self-end md:self-auto"
                          disabled={disabledSubmit}
                          aria-label={isSubmitting ? "Creating workspace" : "Create workspace and run agent"}
                        >
                          {isSubmitting ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : (
                            <Clapperboard className="size-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <div className="flex items-center gap-2">
                          <span>Create Workspace</span>
                          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                            <Command className="size-3" /><ArrowBigUp className="size-3" /><span className="text-xs">↵</span>
                          </kbd>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Popover open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex size-9 items-center justify-center rounded-md border border-border/60 bg-background/35 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        aria-label="Open advanced workspace options"
                      >
                        <Ellipsis className="size-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="right"
                      align="end"
                      sideOffset={8}
                      collisionPadding={16}
                      className="flex w-[min(92vw,760px)] max-w-[760px] flex-col overflow-hidden rounded-[1.5rem] border border-border/60 bg-background p-0 shadow-2xl backdrop-blur-md"
                      style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
                    >
                      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                        <div className="grid gap-5">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="grid gap-2">
                            <Label htmlFor="workspace-name-inline">Name</Label>
                            <Input
                              id="workspace-name-inline"
                              value={name}
                              onChange={(event) => {
                                nameTouchedRef.current = true;
                                setSubmitError(null);
                                setBranchError(null);
                                setName(event.target.value);
                              }}
                              placeholder="Workspace display name"
                              className="h-10 bg-muted/35"
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="workspace-branch-inline">Current workspace branch</Label>
                            <Input
                              id="workspace-branch-inline"
                              ref={branchInputRef}
                              value={branch}
                              onChange={(event) => {
                                branchTouchedRef.current = true;
                                setSubmitError(null);
                                setBranchError(null);
                                setBranch(event.target.value);
                              }}
                              placeholder="Workspace branch"
                              className="h-10 bg-muted/35"
                            />
                            {branchError ? (
                              <div className="rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                                <span>{branchError}</span>
                                {isAutoGeneratedBranchConflictError(branchError) ? (
                                  <Button
                                    type="button"
                                    variant="link"
                                    className="ml-1 h-auto p-0 text-xs align-baseline"
                                    onClick={handleRegenerateBranch}
                                  >
                                    Random generate again
                                  </Button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="workspace-base-branch-trigger-inline">Base branch</Label>
                          <DropdownMenu
                            open={isBaseBranchOpen}
                            onOpenChange={(open) => {
                              setIsBaseBranchOpen(open);
                              if (open) setBaseBranchFilter("");
                            }}
                            modal={false}
                          >
                            <DropdownMenuTrigger asChild>
                              <button
                                id="workspace-base-branch-trigger-inline"
                                type="button"
                                disabled={isBaseBranchesLoading || remoteBranches.length === 0}
                                className="flex h-11 w-full items-center justify-between rounded-xl border border-border/60 bg-muted/35 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <div className="flex min-w-0 items-center text-muted-foreground">
                                  <span className="mr-1 shrink-0 opacity-50">origin/</span>
                                  <span className="truncate">{baseBranch}</span>
                                </div>
                                <ChevronDown className="size-4 opacity-50" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] p-3">
                              <div className="space-y-2">
                                <p className="text-[12px] text-muted-foreground">Select target branch</p>
                                <Input
                                  value={baseBranchFilter}
                                  onChange={(event) => setBaseBranchFilter(event.target.value)}
                                  onKeyDown={(event) => event.stopPropagation()}
                                  placeholder="Search branches..."
                                  className="h-8 text-[12px]"
                                />
                              </div>
                              <ScrollArea className="mt-2 h-[220px] overflow-x-auto">
                                <div className="p-1">
                                  {isBaseBranchesLoading ? (
                                    <div className="p-2 text-center text-[12px] text-muted-foreground">
                                      Loading branches...
                                    </div>
                                  ) : filteredRemoteBranches.length > 0 ? (
                                    filteredRemoteBranches.map((remoteBranch) => (
                                      <DropdownMenuItem
                                        key={remoteBranch}
                                        onClick={() => setBaseBranch(remoteBranch)}
                                        className={cn(
                                          "cursor-pointer justify-between whitespace-nowrap text-[13px]",
                                          baseBranch === remoteBranch &&
                                            "bg-accent text-accent-foreground",
                                        )}
                                      >
                                        <span className="flex items-center">
                                          {baseBranch === remoteBranch ? (
                                            <Check className="mr-2 size-3.5 text-emerald-500" />
                                          ) : (
                                            <GitBranch className="mr-2 size-3.5 text-muted-foreground" />
                                          )}
                                          <span className="mr-1 text-muted-foreground/60">origin/</span>
                                          <span>{remoteBranch}</span>
                                        </span>
                                      </DropdownMenuItem>
                                    ))
                                  ) : (
                                    <div className="p-2 text-center text-[12px] text-muted-foreground">
                                      No matching branches
                                    </div>
                                  )}
                                </div>
                              </ScrollArea>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="rounded-2xl border border-border/60 bg-background/35">
                          <div className="flex items-center gap-2 p-1.5">
                          <button
                            type="button"
                            onClick={() => handleSelectLinkType("issue")}
                            className={cn(
                              "inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
                              linkType === "issue"
                                ? "bg-muted text-foreground shadow-sm"
                                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                            )}
                          >
                            <CircleDot className="size-4" />
                            <span className="font-medium">GitHub Issue</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectLinkType("pr")}
                            className={cn(
                              "inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
                              linkType === "pr"
                                ? "bg-muted text-foreground shadow-sm"
                                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                            )}
                          >
                            <GitPullRequestArrow className="size-4" />
                            <span className="font-medium">GitHub PR</span>
                          </button>
                          {repoContext && linkType === "issue" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => void handleRefreshIssues()}
                              disabled={isIssuesLoading}
                              title="Refresh issues"
                            >
                              <RotateCw className={cn("size-4", isIssuesLoading && "animate-spin [animation-direction:reverse]")} />
                            </Button>
                          ) : repoContext && linkType === "pr" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => void handleRefreshPrs()}
                              disabled={isPrsLoading}
                              title="Refresh PRs"
                            >
                              <RotateCw className={cn("size-4", isPrsLoading && "animate-spin [animation-direction:reverse]")} />
                            </Button>
                          ) : null}
                          </div>

                        <Collapsible open={linkType !== "none"}>
                          <CollapsibleContent>
                        {displayedLinkType === "issue" ? (
                          <div className="border-t border-border/60 p-4">
                            <div className="space-y-4">
                              {repoContext ? (
                                <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                                  <div className="grid min-w-0 gap-2">
                                    <Label htmlFor="issue-select-inline">Select from repository</Label>
                                    <Select
                                      value={selectedIssueNumber}
                                      onValueChange={handleSelectIssue}
                                      disabled={!isIssuesLoading && issues.length === 0}
                                    >
                                      <SelectTrigger
                                        id="issue-select-inline"
                                        className="w-full min-w-0 [&>span]:flex [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate"
                                      >
                                        <SelectValue
                                          placeholder={
                                            isIssuesLoading
                                              ? "Loading issues..."
                                              : issues.length === 0
                                                ? "No issues available"
                                                : "Select issue"
                                          }
                                        />
                                      </SelectTrigger>
                                      <SelectContent className="max-h-80">
                                        {issues.length === 0 ? (
                                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                            No GitHub issues found
                                          </div>
                                        ) : (
                                          issues.map((issue) => (
                                            <SelectItem key={issue.number} value={String(issue.number)}>
                                              <div className="flex min-w-0 items-center gap-2">
                                                <span className="font-mono text-xs text-muted-foreground">
                                                  #{issue.number}
                                                </span>
                                                <span className="truncate">{issue.title}</span>
                                              </div>
                                            </SelectItem>
                                          ))
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div className="grid gap-2">
                                    <Label htmlFor="issue-url-inline">Or paste issue URL</Label>
                                    <div className="flex gap-2">
                                      <Input
                                        id="issue-url-inline"
                                        value={issueUrl}
                                        onChange={(event) => {
                                          setIssuePreview(null);
                                          setIssueError(null);
                                          setIssueUrl(event.target.value);
                                        }}
                                        placeholder={`https://github.com/${repoContext.owner}/${repoContext.repo}/issues/40`}
                                      />
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={handleLoadIssueFromUrl}
                                        disabled={isIssuePreviewLoading || !issueUrl.trim()}
                                        title="Load issue"
                                      >
                                        {isIssuePreviewLoading ? (
                                          <Loader2 className="size-4 animate-spin" />
                                        ) : (
                                          <CloudDownload className="size-4" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ) : selectedProjectId ? (
                                <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                                  This project does not expose a GitHub remote, so issue import is unavailable.
                                </div>
                              ) : (
                                <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                                  Select a project first to load GitHub issue sync.
                                </div>
                              )}

                              {issueError ? (
                                <div className="rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                                  {issueError}
                                </div>
                              ) : null}

                              {isIssuePreviewLoading ? (
                                <div className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-4 text-sm text-muted-foreground">
                                  <Loader2 className="size-4 animate-spin" />
                                  Loading issue preview
                                </div>
                              ) : issuePreview ? (
                                <Card className="rounded-xl border border-border/70 bg-muted/20 shadow-none">
                                  <CardContent className="space-y-3 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-muted-foreground">
                                            {issuePreview.owner}/{issuePreview.repo}#{issuePreview.number}
                                          </span>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-6 gap-1 rounded-md px-2 text-[11px]"
                                            onClick={() =>
                                              window.open(issuePreview.url, "_blank", "noopener,noreferrer")
                                            }
                                          >
                                            <ExternalLink className="size-3" />
                                            Open on GitHub
                                          </Button>
                                        </div>
                                        <h3 className="mt-1 truncate text-sm font-medium text-foreground">
                                          {issuePreview.title}
                                        </h3>
                                      </div>
                                      <Badge variant="secondary" className="capitalize rounded-full">
                                        {issuePreview.state}
                                      </Badge>
                                    </div>

                                    {issuePreview.labels.length > 0 ? (
                                      <div className="flex flex-wrap gap-2">
                                        {issuePreview.labels.map((label) => (
                                          <Badge key={label.name} variant="outline" className="rounded-full">
                                            {label.name}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : null}

                                    <p className="line-clamp-6 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                                      {issuePreview.body?.trim() || "No issue description provided."}
                                    </p>
                                  </CardContent>
                                </Card>
                              ) : null}

                              <label className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-3 text-sm">
                                <Checkbox
                                  checked={autoExtractTodos}
                                  onCheckedChange={(checked) => setAutoExtractTodos(Boolean(checked))}
                                  disabled={!canAutoExtractTodosIssue}
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 font-medium text-foreground">
                                    <Sparkles className="size-4 text-muted-foreground" />
                                    Auto-extract TODOs with LLM
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {autoExtractDescriptionIssue}
                                  </p>
                                </div>
                              </label>
                            </div>
                          </div>
                        ) : null}

                        {displayedLinkType === "pr" ? (
                          <div className="border-t border-border/60 p-4">
                            <div className="space-y-4">
                              {repoContext ? (
                                <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                                  <div className="grid min-w-0 gap-2">
                                    <Label htmlFor="pr-select-inline">Select from repository</Label>
                                    <Select
                                      value={selectedPrNumber}
                                      onValueChange={handleSelectPr}
                                      disabled={!isPrsLoading && prs.length === 0}
                                    >
                                      <SelectTrigger
                                        id="pr-select-inline"
                                        className="w-full min-w-0 [&>span]:flex [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate"
                                      >
                                        <SelectValue
                                          placeholder={
                                            isPrsLoading
                                              ? "Loading PRs..."
                                              : prs.length === 0
                                                ? "No PRs available"
                                                : "Select PR"
                                          }
                                        />
                                      </SelectTrigger>
                                      <SelectContent className="max-h-80">
                                        {prs.length === 0 ? (
                                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                            No GitHub PRs found
                                          </div>
                                        ) : (
                                          prs.map((pr) => (
                                            <SelectItem key={pr.number} value={String(pr.number)}>
                                              <div className="flex min-w-0 items-center gap-2">
                                                <span className="font-mono text-xs text-muted-foreground">
                                                  #{pr.number}
                                                </span>
                                                <span className="truncate">{pr.title}</span>
                                              </div>
                                            </SelectItem>
                                          ))
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div className="grid gap-2">
                                    <Label htmlFor="pr-url-inline">Or paste PR URL</Label>
                                    <div className="flex gap-2">
                                      <Input
                                        id="pr-url-inline"
                                        value={prUrl}
                                        onChange={(event) => {
                                          setPrPreview(null);
                                          setPrError(null);
                                          setPrUrl(event.target.value);
                                        }}
                                        placeholder={`https://github.com/${repoContext.owner}/${repoContext.repo}/pull/40`}
                                      />
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={handleLoadPrFromUrl}
                                        disabled={isPrPreviewLoading || !prUrl.trim()}
                                        title="Load PR"
                                      >
                                        {isPrPreviewLoading ? (
                                          <Loader2 className="size-4 animate-spin" />
                                        ) : (
                                          <CloudDownload className="size-4" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ) : selectedProjectId ? (
                                <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                                  This project does not expose a GitHub remote, so PR import is unavailable.
                                </div>
                              ) : (
                                <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                                  Select a project first to load GitHub PRs.
                                </div>
                              )}

                              {prError ? (
                                <div className="rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                                  {prError}
                                </div>
                              ) : null}

                              {isPrPreviewLoading ? (
                                <div className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-4 text-sm text-muted-foreground">
                                  <Loader2 className="size-4 animate-spin" />
                                  Loading PR preview
                                </div>
                              ) : prPreview ? (
                                <Card className="rounded-xl border border-border/70 bg-muted/20 shadow-none">
                                  <CardContent className="space-y-3 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-muted-foreground">
                                            {prPreview.owner}/{prPreview.repo}#{prPreview.number}
                                          </span>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-6 gap-1 rounded-md px-2 text-[11px]"
                                            onClick={() =>
                                              window.open(prPreview.url, "_blank", "noopener,noreferrer")
                                            }
                                          >
                                            <ExternalLink className="size-3" />
                                            Open on GitHub
                                          </Button>
                                        </div>
                                        <h3 className="mt-1 truncate text-sm font-medium text-foreground">
                                          {prPreview.title}
                                        </h3>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                          <span className="inline-flex items-center gap-1">
                                            <GitBranch className="size-3" />
                                            {prPreview.head_ref}
                                          </span>
                                          <span className="opacity-50">→</span>
                                          <span className="inline-flex items-center gap-1">
                                            <GitBranch className="size-3" />
                                            {prPreview.base_ref}
                                          </span>
                                        </div>
                                      </div>
                                      <Badge variant="secondary" className="capitalize rounded-full">
                                        {prPreview.is_draft ? "draft" : prPreview.state}
                                      </Badge>
                                    </div>

                                    {prPreview.labels.length > 0 ? (
                                      <div className="flex flex-wrap gap-2">
                                        {prPreview.labels.map((label) => (
                                          <Badge key={label.name} variant="outline" className="rounded-full">
                                            {label.name}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : null}

                                    <p className="line-clamp-6 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                                      {prPreview.body?.trim() || "No PR description provided."}
                                    </p>

                                    <div className="rounded-md border border-border/70 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">
                                      The workspace will reuse <span className="font-mono text-foreground">{prPreview.head_ref}</span> directly — no new branch will be created.
                                    </div>
                                  </CardContent>
                                </Card>
                              ) : null}

                              <label className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-3 text-sm">
                                <Checkbox
                                  checked={autoExtractTodosPr}
                                  onCheckedChange={(checked) => setAutoExtractTodosPr(Boolean(checked))}
                                  disabled={!canAutoExtractTodosPr}
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 font-medium text-foreground">
                                    <Sparkles className="size-4 text-muted-foreground" />
                                    Auto-extract TODOs with LLM
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {autoExtractDescriptionPr}
                                  </p>
                                </div>
                              </label>
                            </div>
                          </div>
                        ) : null}
                          </CollapsibleContent>
                        </Collapsible>
                        </div>

                        {submitError ? (
                          <div className="rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                            {submitError}
                          </div>
                        ) : null}

                      </div>
                    </div>
                    </PopoverContent>
                  </Popover>

                  {mentionPopover && typeof document !== "undefined"
                    ? createPortal(
                        <>
                          <div
                            className="fixed inset-0 z-[2147483646]"
                            onMouseDown={() => setMentionPopover(null)}
                          />
                          <div
                            ref={mentionPopoverListRef}
                            className="fixed z-[2147483647] w-[min(90vw,460px)] max-h-80 overflow-y-auto rounded-md border border-border/70 bg-popover p-1 text-sm text-popover-foreground shadow-md"
                            style={{
                              top: mentionPopover.top,
                              left: mentionPopover.left,
                            }}
                          >
                            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
                              <Github className="size-3" />
                              <span>GitHub</span>
                            </div>
                            {(() => {
                              const issueIdx = issuePreview ? 0 : -1;
                              const prIdx = prPreview ? (issuePreview ? 1 : 0) : -1;
                              return (
                                <>
                                  {issuePreview ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          ref={(el) => {
                                            mentionItemRefs.current[issueIdx] = el;
                                          }}
                                          className={cn(
                                            "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left hover:bg-muted",
                                            issueIdx === activeMentionFileIndex && "bg-muted",
                                          )}
                                          onMouseDown={(event) => {
                                            event.preventDefault();
                                            selectMentionNavItem({
                                              type: "issue",
                                              issue: issuePreview,
                                            });
                                          }}
                                        >
                                          <CircleDot className="size-4 text-muted-foreground" />
                                          <span className="font-mono text-xs text-muted-foreground">
                                            #{issuePreview.number}
                                          </span>
                                          <span className="truncate">{issuePreview.title}</span>
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="right"
                                        align="end"
                                        className="z-[2147483647] max-w-xs whitespace-normal break-words"
                                      >
                                        #{issuePreview.number} {issuePreview.title}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : null}
                                  {prPreview ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          ref={(el) => {
                                            mentionItemRefs.current[prIdx] = el;
                                          }}
                                          className={cn(
                                            "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left hover:bg-muted",
                                            prIdx === activeMentionFileIndex && "bg-muted",
                                          )}
                                          onMouseDown={(event) => {
                                            event.preventDefault();
                                            selectMentionNavItem({
                                              type: "pr",
                                              pr: prPreview,
                                            });
                                          }}
                                        >
                                          <GitPullRequestArrow className="size-4 text-muted-foreground" />
                                          <span className="font-mono text-xs text-muted-foreground">
                                            #{prPreview.number}
                                          </span>
                                          <span className="truncate">{prPreview.title}</span>
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="right"
                                        align="end"
                                        className="z-[2147483647] max-w-xs whitespace-normal break-words"
                                      >
                                        #{prPreview.number} {prPreview.title}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : null}
                                </>
                              );
                            })()}
                            <div className="my-1 h-px bg-border/60" />
                            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
                              <Files className="size-3" />
                              <span>Files</span>
                            </div>
                            {isMentionFilesLoading ? (
                              <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
                                <Loader2 className="size-3.5 animate-spin" />
                                Searching files...
                              </div>
                            ) : mentionFiles.length > 0 ? (
                              mentionFiles.map((item, index) => {
                                const iconProps = getFileIconProps({
                                  name: item.name,
                                  isDir: item.isDir,
                                  className: "size-4",
                                });
                                const githubCount =
                                  (issuePreview ? 1 : 0) + (prPreview ? 1 : 0);
                                const navIndex = githubCount + index;
                                return (
                                  <Tooltip key={item.relativePath}>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        ref={(el) => {
                                          mentionItemRefs.current[navIndex] = el;
                                        }}
                                        className={cn(
                                          "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left hover:bg-muted",
                                          item.isHidden && "text-muted-foreground",
                                          navIndex === activeMentionFileIndex && "bg-muted",
                                        )}
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          selectMentionFile(item);
                                        }}
                                      >
                                        <img {...iconProps} alt="" />
                                        <span className="min-w-0 flex-1 truncate">
                                          {item.name}
                                        </span>
                                        <span className="ml-2 max-w-[55%] shrink truncate text-[11px] text-muted-foreground text-right">
                                          {item.relativePath}
                                        </span>
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="right"
                                      align="end"
                                      className="z-[2147483647] max-w-xs whitespace-normal break-words"
                                    >
                                      {item.relativePath}
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })
                            ) : (
                              <div className="px-2.5 py-2 text-xs text-muted-foreground">
                                Continue typing after @ to search files
                              </div>
                            )}
                          </div>
                        </>,
                        document.body,
                      )
                    : null}

                  {previewAttachment && typeof document !== "undefined"
                    ? createPortal(
                        <div
                          className="fixed inset-0 z-[2147483647] flex cursor-zoom-out items-center justify-center bg-black/80 backdrop-blur-sm"
                          onClick={() => setPreviewAttachment(null)}
                        >
                          <img
                            src={previewAttachment.objectUrl}
                            alt={previewAttachment.filename}
                            className="max-h-[92vh] max-w-[92vw] rounded-md object-contain shadow-2xl"
                          />
                        </div>,
                        document.body,
                      )
                    : null}
                  {filledSummaryItems.length > 0 ? (
                    <div className="scrollbar-on-hover flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap pr-1">
                      {filledSummaryItems.map((item) => (
                        <Tooltip key={item.key}>
                          <TooltipTrigger asChild>
                            <span
                              className="inline-flex h-6 max-w-[9rem] cursor-default items-center gap-1.5 rounded-md border border-border/70 bg-muted/35 px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
                            >
                              {renderSummaryIcon(item.key)}
                              <span className="truncate">{item.value}</span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">{item.title}</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              </div>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              <span>Add a project before creating a workspace from the welcome composer.</span>
              <Button type="button" variant="outline" className="rounded-md" onClick={onAddProject}>
                Add Project
              </Button>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
};

export default WelcomePage;
