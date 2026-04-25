"use client";

import React from "react";
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
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@workspace/ui";
import {
  Bot,
  Check,
  ChevronDown,
  Clapperboard,
  Ellipsis,
  Eye,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  Github,
  Loader2,
  LoaderCircle,
  Plus,
  RotateCw,
  Sparkles,
} from "lucide-react";
import dynamic from "next/dynamic";
import { AtmosWordmark } from "@/components/ui/AtmosWordmark";

const PixelBlast = dynamic(
  () => import("@workspace/ui/components/ui/pixel-blast"),
  { ssr: false },
);
import {
  codeAgentCustomApi,
  functionSettingsApi,
  gitApi,
  llmProvidersApi,
  type CodeAgentCustomEntry,
  type GithubIssuePayload,
  type LlmProvidersFile,
  wsGithubApi,
  wsScriptApi,
} from "@/api/ws-api";
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

type WelcomeHeadline =
  | "come_alive"
  | "spin_up_next"
  | "start_building_with_you"
  | "deserves_workspace";

const ISSUE_CACHE_TTL_MS = 5 * 60 * 1000;
const issueListCache = new Map<string, { expiresAt: number; issues: GithubIssuePayload[] }>();
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
const promptCardNotchClipPath = [
  `polygon(${PROMPT_CARD_NOTCH_WIDTH_PX}px 0`,
  "100% 0",
  "100% 100%",
  "0 100%",
  `0 ${PROMPT_CARD_NOTCH_HEIGHT_PX}px`,
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
  const [repoContext, setRepoContext] = React.useState<RepoContext | null>(null);
  const [issueError, setIssueError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [branchError, setBranchError] = React.useState<string | null>(null);
  const [hasSetupScript, setHasSetupScript] = React.useState(false);
  const [autoExtractTodos, setAutoExtractTodos] = React.useState(false);
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
  const advancedPopoverRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  React.useEffect(() => {
    setHeadline(WELCOME_HEADLINES[Math.floor(Math.random() * WELCOME_HEADLINES.length)]);
  }, []);

  React.useEffect(() => {
    if (!isAdvancedOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (advancedPopoverRef.current?.contains(target)) return;
      setIsAdvancedOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isAdvancedOpen]);

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
          const flags = agentCustomSettings[agent.id]?.flags?.trim() || agent.yoloFlag || "";
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
      setHasSetupScript(false);

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
          const cached = issueListCache.get(cacheKey);
          if (cached && cached.expiresAt > Date.now()) {
            setIssues(cached.issues);
            return;
          }

          setIsIssuesLoading(true);
          const fetchedIssues = await wsGithubApi.listIssues(nextContext);
          if (cancelled) return;
          setIssues(fetchedIssues);
          issueListCache.set(cacheKey, {
            expiresAt: Date.now() + ISSUE_CACHE_TTL_MS,
            issues: fetchedIssues,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setIssueError(error instanceof Error ? error.message : "Failed to load project context");
        }
      } finally {
        if (!cancelled) {
          setIsBaseBranchesLoading(false);
          setIsIssuesLoading(false);
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
      generatedBranchRef.current = null;
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
  }, [issuePreview]);

  React.useEffect(() => {
    if (!issuePreview || !todoProviderLabel) {
      setAutoExtractTodos(false);
    }
  }, [issuePreview, todoProviderLabel]);

  const composerPlaceholder = React.useMemo(() => {
    const projectName = selectedProject?.name?.trim() || "这个项目";
    const agentName = selectedAgent?.label?.trim() || "当前 Agent";
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
  const canAutoExtractTodos = !!issuePreview && !!todoProviderLabel && !isLlmRoutingLoading;
  const autoExtractDescription = !issuePreview
    ? "Import a GitHub issue first."
    : isLlmRoutingLoading
      ? "Checking LLM routing..."
      : todoProviderLabel
        ? `Uses ${todoProviderLabel} to extract an initial task checklist from the issue description.`
        : "Configure LLM Providers > Routing > Workspace issue TODO extraction first.";
  const filledSummaryItems = React.useMemo(() => {
    const items: Array<{
      key: "display-name" | "base-branch" | "workspace-branch" | "github-issue" | "auto-todos";
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
    if (autoExtractTodos && canAutoExtractTodos) {
      items.push({
        key: "auto-todos",
        value: "TODOs",
        title: "Auto-extract TODOs with LLM: on",
      });
    }

    return items;
  }, [autoExtractTodos, baseBranch, branch, canAutoExtractTodos, issuePreview, name]);

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
      case "auto-todos":
        return <Sparkles className="size-3 shrink-0" />;
    }
  };

  const handleSelectIssue = (value: string) => {
    setSelectedIssueNumber(value);
    setIssueUrl("");
    setIssueError(null);
    setBranchError(null);
    setSubmitError(null);
    setIssuePreview(issues.find((issue) => String(issue.number) === value) ?? null);
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
      const finalDisplayName =
        name.trim() || (issuePreview ? issueToWorkspaceName(issuePreview) : "");
      const finalBranch =
        branch.trim() ||
        (!branchTouchedRef.current && generatedBranchRef.current) ||
        (issuePreview ? issueToBranchName(issuePreview) : "");

      const workspaceId = await addWorkspace({
        projectId,
        name: finalBranch,
        displayName: finalDisplayName || null,
        branch: finalBranch,
        baseBranch,
        initialRequirement: initialRequirement.trim() || null,
        githubIssue: issuePreview,
        autoExtractTodos: autoExtractTodos && !!issuePreview && !!todoProviderLabel,
        hasSetupScript,
        priority,
        workflowStatus,
        labels: selectedLabels,
      });
      queueAgentRun({
        workspaceId,
        prompt: initialRequirement.trim() || finalDisplayName || finalBranch,
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

  if (!isMounted) {
    return (
      <div
        className={cn(
          "min-h-full overflow-y-auto bg-background px-4 py-8 selection:bg-foreground/10 sm:px-6",
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
        "relative min-h-full overflow-y-auto bg-background px-4 py-8 selection:bg-foreground/10 sm:px-6",
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
                  className="absolute -left-3 -top-3 z-20 inline-flex size-10 cursor-pointer items-center justify-center rounded-xl border border-border/60 bg-background text-foreground/90 shadow-[0_6px_20px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
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
                  <div className="relative">
                    {!initialRequirement ? (
                      <div className="pointer-events-none absolute inset-y-auto right-2 top-2 left-0 overflow-hidden text-base leading-7 text-muted-foreground/65">
                        {exitingPlaceholder ? (
                          <span className="welcome-placeholder-exit block truncate">
                            {exitingPlaceholder}
                          </span>
                        ) : null}
                        <span
                          key={visiblePlaceholder}
                          className={cn(
                            "block truncate",
                            exitingPlaceholder
                              ? "welcome-placeholder-enter absolute inset-x-0 top-0"
                              : "welcome-placeholder-enter",
                          )}
                        >
                          {visiblePlaceholder}
                        </span>
                      </div>
                    ) : null}
                    <textarea
                      value={initialRequirement}
                      onChange={(event) => {
                        setInitialRequirement(event.target.value);
                        setSubmitError(null);
                      }}
                      placeholder=""
                      className="min-h-[88px] w-full resize-none rounded-xl border border-transparent bg-transparent py-2 pl-0 pr-2 text-base leading-7 text-foreground outline-none transition-colors"
                    />
                  </div>

                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex h-9 min-w-[160px] items-center gap-2 rounded-md border px-3 text-sm backdrop-blur-sm transition-colors",
                              projects.length === 0
                                ? "border-dashed border-border bg-muted/25 text-muted-foreground hover:bg-muted/35"
                                : "border-border/60 bg-background/40 text-foreground/90 hover:bg-background/55",
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
                  </div>
                </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div ref={advancedPopoverRef} className="relative">
                    <button
                      type="button"
                      className="inline-flex size-9 items-center justify-center rounded-md border border-border/60 bg-background/35 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      aria-label="Open advanced workspace options"
                      onClick={() => setIsAdvancedOpen((open) => !open)}
                    >
                      <Ellipsis className="size-4" />
                    </button>

                    <div
                      className={cn(
                        "absolute left-[calc(100%+0.5rem)] top-1/2 z-30 w-[min(92vw,760px)] max-w-[760px] origin-left -translate-y-1/2 rounded-[1.5rem] border border-border/60 bg-background p-0 shadow-2xl backdrop-blur-md transition-all duration-200 ease-out",
                        isAdvancedOpen
                          ? "pointer-events-auto translate-x-0 scale-100 opacity-100"
                          : "pointer-events-none -translate-x-2 scale-[0.18] opacity-0"
                      )}
                    >
                      <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-5">
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

                        <Collapsible className="rounded-2xl border border-border/60 bg-background/35 shadow-none">
                          <CollapsibleTrigger asChild>
                            <div
                              className="group flex w-full cursor-pointer items-center gap-2 p-4 text-left text-sm font-medium text-foreground"
                              role="button"
                              tabIndex={0}
                            >
                              <span className="relative size-4 shrink-0">
                                <Github className="absolute inset-0 size-4 transition-opacity duration-150 group-hover:opacity-0" />
                                <ChevronDown className="absolute inset-0 size-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
                              </span>
                              GitHub Issue
                            <span className="text-xs font-normal text-muted-foreground">
                              Pull title and branch seed from a repository issue.
                            </span>
                            {repoContext ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="ml-auto size-8"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void handleRefreshIssues();
                                }}
                                disabled={isIssuesLoading}
                                title="Refresh issues"
                              >
                                {isIssuesLoading ? (
                                  <LoaderCircle className="size-4 animate-spin" />
                                ) : (
                                  <RotateCw className="size-4" />
                                )}
                              </Button>
                            ) : null}
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="space-y-4 px-4 pb-4">
                              {repoContext ? (
                                <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                                  <div className="grid gap-2">
                                    <Label htmlFor="issue-select-inline">Select from repository</Label>
                                    <Select
                                      value={selectedIssueNumber}
                                      onValueChange={handleSelectIssue}
                                      disabled={!isIssuesLoading && issues.length === 0}
                                    >
                                      <SelectTrigger id="issue-select-inline">
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
                                        onClick={handleLoadIssueFromUrl}
                                        disabled={isIssuePreviewLoading || !issueUrl.trim()}
                                      >
                                        {isIssuePreviewLoading ? (
                                          <Loader2 className="size-4 animate-spin" />
                                        ) : (
                                          "Load"
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
                                        <div className="text-xs text-muted-foreground">
                                          {issuePreview.owner}/{issuePreview.repo}#{issuePreview.number}
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

                                    <div className="flex justify-end">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 gap-1.5 rounded-md"
                                        onClick={() =>
                                          window.open(issuePreview.url, "_blank", "noopener,noreferrer")
                                        }
                                      >
                                        <ExternalLink className="size-3.5" />
                                        Open on GitHub
                                      </Button>
                                    </div>
                                  </CardContent>
                                </Card>
                              ) : null}

                              <label className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-3 text-sm">
                                <Checkbox
                                  checked={autoExtractTodos}
                                  onCheckedChange={(checked) => setAutoExtractTodos(Boolean(checked))}
                                  disabled={!canAutoExtractTodos}
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 font-medium text-foreground">
                                    <Sparkles className="size-4 text-muted-foreground" />
                                    Auto-extract TODOs with LLM
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {autoExtractDescription}
                                  </p>
                                </div>
                              </label>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>

                        {submitError ? (
                          <div className="rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                            {submitError}
                          </div>
                        ) : null}

                      </div>
                    </div>
                  </div>
                  </div>
                  {filledSummaryItems.length > 0 ? (
                    <div className="scrollbar-on-hover flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap pr-1">
                      {filledSummaryItems.map((item) => (
                        <span
                          key={item.key}
                          title={item.title}
                          className="inline-flex h-6 max-w-[9rem] items-center gap-1.5 rounded-md border border-border/70 bg-muted/35 px-2 text-[11px] text-muted-foreground"
                        >
                          {renderSummaryIcon(item.key)}
                          <span className="truncate">{item.value}</span>
                        </span>
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
