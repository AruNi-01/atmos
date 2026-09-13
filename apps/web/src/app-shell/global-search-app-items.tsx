"use client";

import { createTranslator } from "next-intl";
import {
  Blocks,
  BookOpen,
  Bot,
  BrainCircuit,
  ChartColumnBig,
  Eye,
  Folder,
  FolderPlus,
  GitCommit,
  GitCompare,
  Github,
  Gauge,
  Globe,
  HardDrive,
  History,
  Languages,
  Layers,
  Laptop,
  ListTodo,
  Maximize,
  Minimize,
  Moon,
  PanelLeft,
  PencilRuler,
  Play,
  Plus,
  Presentation,
  RefreshCw,
  Settings,
  Smartphone,
  StickyNote,
  Sun,
  Terminal,
  Timer,
  Zap,
  toastManager,
} from "@workspace/ui";
import { appApi } from "@/api/ws-api";
import type { GithubPrPayload } from "@/api/ws/github-api";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import { settingsHref } from "@/features/settings/lib/open-settings";
import { settingsGroupTabForSearchItem } from "@/features/settings/lib/settings-section-group-tabs";
import { writeQuickOpenLastUsed } from "@/shared/stores/use-ui-pref-hooks";
import { tasksPathWithStoredSource } from "@/features/task/lib/task-source-preference";
import { activateCenterChromeTab } from "@/app-shell/center-stage-activate";
import {
  CHANGES_TAB_VALUE,
  FILES_TAB_VALUE,
  GITHUB_HUB_TAB_VALUE,
  REVIEW_TAB_VALUE,
  RUN_TAB_VALUE,
} from "@/app-shell/center-tool-tabs";
import { GIT_HISTORY_TAB_VALUE } from "@/features/git/types";
import { SIMULATOR_TAB_VALUE } from "@/features/simulator/types";
import { useBrowserCenterTabsStore } from "@/features/browser/store/use-browser-center-tabs";
import { requestBrowserContextUrlFocus } from "@/features/browser/lib/browser-url-focus";
import {
  QUICK_OPEN_APP_OPTIONS,
  QuickOpenAppIcon,
} from "@/app-shell/quick-open-apps";
import enMessages from "../../messages/en.json";
import zhMessages from "../../messages/zh.json";
import { type AppSearchItem } from "@/app-shell/global-search-parts";
import {
  SETTINGS_SEARCH_HIGHLIGHT_STORAGE_KEY,
  SETTINGS_SEARCH_ITEMS,
  SETTINGS_SEARCH_SECTIONS,
} from "@/features/settings/components/settings-modal-data";

type GlobalSearchItemsLocale = "en" | "zh";
type GlobalSearchItemsTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

let cachedGlobalSearchItemsLocale: GlobalSearchItemsLocale | null = null;
let cachedGlobalSearchItemsTranslator: GlobalSearchItemsTranslator | null = null;

function globalSearchItemsT(
  key: string,
  values?: Record<string, string | number>,
): string {
  const locale: GlobalSearchItemsLocale =
    currentAppLocale("en") === "zh" ? "zh" : "en";
  if (
    !cachedGlobalSearchItemsTranslator ||
    cachedGlobalSearchItemsLocale !== locale
  ) {
    cachedGlobalSearchItemsLocale = locale;
    const translator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "appShell.globalSearchItems",
    });
    cachedGlobalSearchItemsTranslator = (key, values) =>
      translator(key as never, values as never);
  }

  return cachedGlobalSearchItemsTranslator(key, values);
}

type RouterLike = {
  push: (href: string) => void;
};

interface SearchWorkspace {
  id: string;
  name: string;
  branch: string;
  localPath?: string | null;
  githubPr?: GithubPrPayload | null;
}

interface SearchProject {
  id: string;
  name: string;
  mainFilePath?: string | null;
  workspaces: SearchWorkspace[];
}

export type GlobalSearchSubView = "todo" | "commit" | "usage" | "note";

interface BuildGlobalSearchItemsParams {
  projects: SearchProject[];
  router: RouterLike;
  setTheme: (theme: string) => void;
  setLocale: (locale: GlobalSearchItemsLocale) => void;
  setGlobalSearchOpen: (open: boolean) => void;
  setCreateProjectOpen: (open: boolean) => void;
  setSelectedProjectId: (projectId: string) => void;
  setCreateWorkspaceOpen: (open: boolean) => void;
  quickAddWorkspace: (projectId: string) => Promise<string | null | undefined>;
  isFullScreen: boolean;
  toggleFullScreen: () => void;
  toggleLeftSidebar: () => void;
  isLeftCollapsed: boolean;
  currentProject?: SearchProject;
  currentWorkspace?: SearchWorkspace;
  currentWorkspaceId?: string | null;
  currentEffectivePath?: string | null;
  centerContextId?: string | null;
  centerWikiTabEnabled: boolean;
  setLlmProvidersOpen: (open: boolean) => void;
  setCanvasOpen: (open: boolean) => void;
  setSubView: (view: GlobalSearchSubView) => void;
  startCreating: (input: { originKey: string; label?: string | null }) => string;
  bindWorkspace: (jobId: string, workspaceId: string, label?: string | null) => void;
  failCreating: (jobId: string) => void;
  createOriginKey: string;
  openModalAgentChat?: () => void;
}

function closeSearchAnd(setGlobalSearchOpen: (open: boolean) => void, run: () => void) {
  run();
  setGlobalSearchOpen(false);
}

export function buildGlobalSearchItems({
  projects,
  router,
  setTheme,
  setLocale,
  setGlobalSearchOpen,
  setCreateProjectOpen,
  setSelectedProjectId,
  setCreateWorkspaceOpen,
  quickAddWorkspace,
  isFullScreen,
  toggleFullScreen,
  toggleLeftSidebar,
  isLeftCollapsed,
  currentProject,
  currentWorkspace,
  currentWorkspaceId,
  currentEffectivePath,
  centerContextId,
  centerWikiTabEnabled,
  setLlmProvidersOpen,
  setCanvasOpen,
  setSubView,
  startCreating,
  bindWorkspace,
  failCreating,
  createOriginKey,
  openModalAgentChat,
}: BuildGlobalSearchItemsParams): AppSearchItem[] {
  const items: AppSearchItem[] = [];
  const setPendingSettingsHighlight = (query: string | null) => {
    if (typeof window === "undefined") return;

    if (query) {
      window.sessionStorage.setItem(SETTINGS_SEARCH_HIGHLIGHT_STORAGE_KEY, query);
      return;
    }

    window.sessionStorage.removeItem(SETTINGS_SEARCH_HIGHLIGHT_STORAGE_KEY);
  };

  const openCenterTab = (tab: string) => {
    if (!centerContextId) return;
    activateCenterChromeTab(centerContextId, tab, { placement: "focused" });
    setGlobalSearchOpen(false);
  };

  projects.forEach((project) => {
    items.push({
      id: `project-${project.id}`,
      type: "project",
      title: project.name,
      description: globalSearchItemsT("projectDescription"),
      keywords: [
        "project",
        "overview",
        "repository",
        "repo",
        project.name,
        project.mainFilePath ?? "",
        ...project.name.split(/[-_/]/),
      ].filter(Boolean),
      icon: <Layers className="size-4 text-muted-foreground" />,
      contextId: project.id,
      action: () => {
        router.push(`/project?id=${project.id}`);
        setGlobalSearchOpen(false);
      },
    });

    project.workspaces.forEach((workspace) => {
      const prKeywords = workspace.githubPr
        ? [
            String(workspace.githubPr.number),
            `#${workspace.githubPr.number}`,
            workspace.githubPr.title,
            "pull request",
            "pr",
          ]
        : [];
      items.push({
        id: `workspace-${workspace.id}`,
        type: "workspace",
        title: workspace.name,
        description: workspace.githubPr
          ? `${project.name} · #${workspace.githubPr.number} ${workspace.githubPr.title}`
          : `${project.name} · ${workspace.branch}`,
        keywords: [
          "workspace",
          workspace.name,
          project.name,
          workspace.branch,
          ...prKeywords,
          ...workspace.name.split(/[-_/]/),
          ...project.name.split(/[-_/]/),
          ...workspace.branch.split(/[-_/]/),
        ].filter(Boolean),
        icon: <Layers className="size-4 text-muted-foreground" />,
        contextId: workspace.id,
        githubPr: workspace.githubPr,
        branch: workspace.branch,
        action: () => {
          router.push(`/workspace?id=${workspace.id}`);
          setGlobalSearchOpen(false);
        },
      });
    });
  });

  items.push(
    {
      id: "theme-light",
      type: "theme",
      title: globalSearchItemsT("themes.light"),
      keywords: ["light", "theme", "appearance", "mode", "bright"],
      icon: <Sun className="size-4 text-muted-foreground" />,
      action: () => closeSearchAnd(setGlobalSearchOpen, () => setTheme("light")),
    },
    {
      id: "theme-dark",
      type: "theme",
      title: globalSearchItemsT("themes.dark"),
      keywords: ["dark", "theme", "appearance", "mode", "night"],
      icon: <Moon className="size-4 text-muted-foreground" />,
      action: () => closeSearchAnd(setGlobalSearchOpen, () => setTheme("dark")),
    },
    {
      id: "theme-system",
      type: "theme",
      title: globalSearchItemsT("themes.system"),
      keywords: ["system", "theme", "appearance", "auto", "default"],
      icon: <Laptop className="size-4 text-muted-foreground" />,
      action: () => closeSearchAnd(setGlobalSearchOpen, () => setTheme("system")),
    },
    {
      id: "language-en",
      type: "theme",
      title: globalSearchItemsT("languages.en"),
      keywords: ["english", "language", "locale", "en", "i18n"],
      icon: <Languages className="size-4 text-muted-foreground" />,
      action: () => closeSearchAnd(setGlobalSearchOpen, () => setLocale("en")),
    },
    {
      id: "language-zh",
      type: "theme",
      title: globalSearchItemsT("languages.zh"),
      keywords: ["chinese", "中文", "language", "locale", "zh", "i18n"],
      icon: <Languages className="size-4 text-muted-foreground" />,
      action: () => closeSearchAnd(setGlobalSearchOpen, () => setLocale("zh")),
    },
    {
      id: "add-project",
      type: "new-workspace",
      title: globalSearchItemsT("addProject"),
      keywords: ["add", "import", "project", "repository", "new", "create", "repo"],
      icon: <FolderPlus className="size-4 text-muted-foreground" />,
      action: () => {
        setCreateProjectOpen(true);
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "launchpad-workspaces",
      type: "launchpad",
      title: globalSearchItemsT("launchpad.workspaces.title"),
      description: globalSearchItemsT("launchpad.workspaces.description"),
      keywords: ["launchpad", "workspaces", "workspace", "admin", "overview"],
      icon: <Layers className="size-4 text-muted-foreground" />,
      action: () => {
        router.push("/workspaces");
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "launchpad-skills",
      type: "launchpad",
      title: globalSearchItemsT("launchpad.skills.title"),
      description: globalSearchItemsT("launchpad.skills.description"),
      keywords: ["launchpad", "skills", "skill", "catalog", "library"],
      icon: <Blocks className="size-4 text-muted-foreground" />,
      action: () => {
        router.push("/skills");
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "launchpad-terminals",
      type: "launchpad",
      title: globalSearchItemsT("launchpad.terminals.title"),
      description: globalSearchItemsT("launchpad.terminals.description"),
      keywords: ["launchpad", "terminals", "terminal", "sessions"],
      icon: <Terminal className="size-4 text-muted-foreground" />,
      action: () => {
        router.push("/terminals");
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "launchpad-agents",
      type: "launchpad",
      title: globalSearchItemsT("launchpad.agents.title"),
      description: globalSearchItemsT("launchpad.agents.description"),
      keywords: ["launchpad", "agents", "agent", "bot", "ai", "chat"],
      icon: <Bot className="size-4 text-muted-foreground" />,
      action: () => {
        router.push("/agents");
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "modal-chat-panel",
      type: "modal",
      title: globalSearchItemsT("modalChat.title"),
      description: globalSearchItemsT("modalChat.description"),
      keywords: ["chat", "agent", "panel", "ai", "assistant", "message", "conversation", "open", "acp"],
      icon: <Bot className="size-4 text-muted-foreground" />,
      action: () => {
        openModalAgentChat?.();
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "launchpad-automations",
      type: "launchpad",
      title: globalSearchItemsT("launchpad.automations.title"),
      description: globalSearchItemsT("launchpad.automations.description"),
      keywords: ["launchpad", "automations", "automation", "schedule", "scheduled", "runs"],
      icon: <Timer className="size-4 text-muted-foreground" />,
      action: () => {
        router.push("/automations");
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "launchpad-disk-analyzer",
      type: "launchpad",
      title: globalSearchItemsT("launchpad.diskAnalyzer.title"),
      description: globalSearchItemsT("launchpad.diskAnalyzer.description"),
      keywords: ["launchpad", "disk", "analyzer", "storage", "usage", "cleanup", "trash", "du"],
      icon: <HardDrive className="size-4 text-muted-foreground" />,
      action: () => {
        router.push("/disk-analyzer");
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "launchpad-token-usage",
      type: "launchpad",
      title: globalSearchItemsT("launchpad.tokenUsage.title"),
      description: globalSearchItemsT("launchpad.tokenUsage.description"),
      keywords: ["launchpad", "token", "tokens", "usage", "cost", "analytics", "stats", "model", "activity", "open"],
      icon: <ChartColumnBig className="size-4 text-muted-foreground" />,
      action: () => {
        router.push("/token-usage");
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "launchpad-pt-design",
      type: "launchpad",
      title: globalSearchItemsT("launchpad.ptDesign.title"),
      description: globalSearchItemsT("launchpad.ptDesign.description"),
      keywords: ["launchpad", "prototype", "design", "pt-design", "wireframe", "board", "mockup"],
      icon: <PencilRuler className="size-4 text-muted-foreground" />,
      action: () => {
        router.push("/pt-design");
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "open-tasks-view",
      type: "launchpad",
      title: globalSearchItemsT("tasks.title"),
      description: globalSearchItemsT("tasks.description"),
      keywords: ["kanban", "task", "board", "workspace", "workspaces", "status", "priority", "view", "open", "github", "issue", "pr"],
      icon: <ListTodo className="size-4 text-muted-foreground" />,
      action: () => {
        router.push(tasksPathWithStoredSource());
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "open-canvas",
      type: "launchpad",
      title: globalSearchItemsT("canvas.title"),
      description: globalSearchItemsT("canvas.description"),
      keywords: ["canvas", "board", "whiteboard", "diagram", "tldraw", "open"],
      icon: <Presentation className="size-4 text-muted-foreground" />,
      action: () => {
        setCanvasOpen(true);
        setGlobalSearchOpen(false);
      },
    },
  );

  if (centerContextId) {
    if (centerWikiTabEnabled) {
      items.push({
        id: "surface-wiki",
        type: "surface",
        title: globalSearchItemsT("wiki.title"),
        description: globalSearchItemsT("wiki.description"),
        keywords: ["wiki", "docs", "documentation", "project wiki", "tab"],
        icon: <BookOpen className="size-4 text-muted-foreground" />,
        action: () => openCenterTab("wiki"),
      });
    }

    items.push(
      {
        id: "surface-browser",
        type: "surface",
        title: globalSearchItemsT("browser.title"),
        description: globalSearchItemsT("browser.description"),
        keywords: ["browser", "web", "tab", "url", "in-app"],
        icon: <Globe className="size-4 text-muted-foreground" />,
        action: () => {
          const tab = useBrowserCenterTabsStore.getState().openBrowser(centerContextId);
          requestBrowserContextUrlFocus(tab.browserContextId);
          openCenterTab(tab.value);
        },
      },
      {
        id: "surface-simulator",
        type: "surface",
        title: globalSearchItemsT("simulator.title"),
        description: globalSearchItemsT("simulator.description"),
        keywords: ["simulator", "ios", "android", "device", "tab"],
        icon: <Smartphone className="size-4 text-muted-foreground" />,
        action: () => openCenterTab(SIMULATOR_TAB_VALUE),
      },
      {
        id: "surface-git-history",
        type: "surface",
        title: globalSearchItemsT("gitHistory.title"),
        description: globalSearchItemsT("gitHistory.description"),
        keywords: ["git", "history", "graph", "commits", "log", "tab"],
        icon: <History className="size-4 text-muted-foreground" />,
        action: () => openCenterTab(GIT_HISTORY_TAB_VALUE),
      },
      {
        id: "surface-changes",
        type: "surface",
        title: globalSearchItemsT("surfaces.changes.title"),
        description: globalSearchItemsT("surfaces.changes.description"),
        keywords: ["changes", "diff", "git", "unstaged", "tab"],
        icon: <GitCompare className="size-4 text-muted-foreground" />,
        action: () => openCenterTab(CHANGES_TAB_VALUE),
      },
      {
        id: "surface-review",
        type: "surface",
        title: globalSearchItemsT("surfaces.review.title"),
        description: globalSearchItemsT("surfaces.review.description"),
        keywords: ["review", "code review", "tab"],
        icon: <Eye className="size-4 text-muted-foreground" />,
        action: () => openCenterTab(REVIEW_TAB_VALUE),
      },
      {
        id: "surface-run",
        type: "surface",
        title: globalSearchItemsT("surfaces.run.title"),
        description: globalSearchItemsT("surfaces.run.description"),
        keywords: ["run", "execute", "tab"],
        icon: <Play className="size-4 text-muted-foreground" />,
        action: () => openCenterTab(RUN_TAB_VALUE),
      },
      {
        id: "surface-github",
        type: "surface",
        title: globalSearchItemsT("surfaces.github.title"),
        description: globalSearchItemsT("surfaces.github.description"),
        keywords: ["github", "pull request", "issue", "pr", "tab"],
        icon: <Github className="size-4 text-muted-foreground" />,
        action: () => openCenterTab(GITHUB_HUB_TAB_VALUE),
      },
      {
        id: "surface-files",
        type: "surface",
        title: globalSearchItemsT("surfaces.files.title"),
        description: globalSearchItemsT("surfaces.files.description"),
        keywords: ["files", "file tree", "explorer", "tab"],
        icon: <Folder className="size-4 text-muted-foreground" />,
        action: () => openCenterTab(FILES_TAB_VALUE),
      },
    );
  }

  items.push(
    {
      id: "modal-llm-providers",
      type: "modal",
      title: globalSearchItemsT("llmProviders.title"),
      description: globalSearchItemsT("llmProviders.description"),
      keywords: ["llm", "provider", "api", "key", "model", "openai", "anthropic", "settings", "configure", "ai"],
      icon: <BrainCircuit className="size-4 text-muted-foreground" />,
      action: () => {
        setLlmProvidersOpen(true);
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "ai-quota-usage",
      type: "usage",
      title: globalSearchItemsT("aiQuota.title"),
      description: globalSearchItemsT("aiQuota.description"),
      keywords: ["ai", "quota", "usage", "provider", "providers", "limit", "limits", "refresh", "open"],
      icon: <Gauge className="size-4 text-muted-foreground" />,
      action: () => {
        setSubView("usage");
      },
    },
    {
      id: "modal-settings",
      type: "modal",
      title: globalSearchItemsT("settings.title"),
      description: globalSearchItemsT("settings.description"),
      keywords: ["setting", "settings", "preferences", "configure", "config", "open"],
      icon: <Settings className="size-4 text-muted-foreground" />,
      action: () => {
        setPendingSettingsHighlight(null);
        router.push(settingsHref("general", "about"));
        setGlobalSearchOpen(false);
      },
    },
  );

  SETTINGS_SEARCH_SECTIONS.forEach((section) => {
    items.push({
      id: `settings-${section.id}`,
      type: "modal",
      title: globalSearchItemsT("settings.sectionTitle", { label: section.label }),
      description: section.description,
      keywords: [
        "settings",
        "setting",
        "preferences",
        "configure",
        section.id,
        section.label,
        ...section.keywords,
      ],
      icon: <Settings className="size-4 text-muted-foreground" />,
      searchOnly: true,
      action: () => {
        setPendingSettingsHighlight(null);
        router.push(settingsHref(section.id));
        setGlobalSearchOpen(false);
      },
    });
  });

  SETTINGS_SEARCH_ITEMS.forEach((settingItem) => {
    items.push({
      id: `settings-item-${settingItem.id}`,
      type: "modal",
      title: globalSearchItemsT("settings.itemTitle", { label: settingItem.label }),
      description: `${settingItem.sectionLabel} · ${settingItem.description}`,
      keywords: [
        "settings",
        "setting",
        "preferences",
        "configure",
        settingItem.sectionId,
        settingItem.sectionLabel,
        settingItem.label,
        settingItem.description,
        ...settingItem.keywords,
      ],
      icon: <Settings className="size-4 text-muted-foreground" />,
      searchOnly: true,
      action: () => {
        setPendingSettingsHighlight(`${settingItem.label} ${settingItem.description}`.trim());
        router.push(settingsHref(
          settingItem.sectionId,
          settingsGroupTabForSearchItem(settingItem) ?? undefined,
        ));
        setGlobalSearchOpen(false);
      },
    });
  });

  if ((currentWorkspaceId || currentProject) && currentEffectivePath) {
    const todoLabel = currentWorkspace ? currentWorkspace.name : currentProject?.name;
    items.push(
      {
        id: "todo-current-workspace",
        type: "todo",
        title: globalSearchItemsT("workspaceTodos.title"),
        description: todoLabel ? globalSearchItemsT("workspaceTodos.descriptionWithLabel", { label: todoLabel }) : globalSearchItemsT("workspaceTodos.description"),
        keywords: ["todo", "task", "tasks", "checklist", "workspace", "project", "overview", "plan"],
        icon: <ListTodo className="size-4 text-muted-foreground" />,
        action: () => {
          setSubView("todo");
        },
      },
      {
        id: "note-current-workspace",
        type: "note",
        title: globalSearchItemsT("workspaceNotes.title"),
        description: todoLabel ? globalSearchItemsT("workspaceNotes.descriptionWithLabel", { label: todoLabel }) : globalSearchItemsT("workspaceNotes.description"),
        keywords: ["note", "notes", "memo", "scratch", "workspace", "project"],
        icon: <StickyNote className="size-4 text-muted-foreground" />,
        action: () => {
          setSubView("note");
        },
      },
      {
        id: "commit-current-workspace",
        type: "commit",
        title: globalSearchItemsT("commitPush.title"),
        description: todoLabel ? globalSearchItemsT("commitPush.descriptionWithLabel", { label: todoLabel }) : globalSearchItemsT("commitPush.description"),
        keywords: ["commit", "push", "git", "changes", "sync", "publish", "workspace", "project"],
        icon: <GitCommit className="size-4 text-muted-foreground" />,
        action: () => {
          setSubView("commit");
        },
      },
    );
  }

  items.push(
    {
      id: "toggle-sidebar",
      type: "command",
      title: isLeftCollapsed
        ? globalSearchItemsT("sidebar.show")
        : globalSearchItemsT("sidebar.hide"),
      description: globalSearchItemsT("sidebar.description"),
      keywords: ["sidebar", "left", "panel", "toggle", "collapse", "expand"],
      icon: <PanelLeft className="size-4 text-muted-foreground" />,
      shortcut: "⌘B",
      action: () => closeSearchAnd(setGlobalSearchOpen, toggleLeftSidebar),
    },
    {
      id: "refresh-page",
      type: "command",
      title: globalSearchItemsT("refresh.title"),
      description: globalSearchItemsT("refresh.description"),
      keywords: ["refresh", "reload", "page"],
      icon: <RefreshCw className="size-4 text-muted-foreground" />,
      shortcut: "⌘R",
      action: () => {
        setGlobalSearchOpen(false);
        window.location.reload();
      },
    },
    {
      id: "toggle-fullscreen",
      type: "command",
      title: isFullScreen ? globalSearchItemsT("fullscreen.exit") : globalSearchItemsT("fullscreen.enter"),
      keywords: ["full", "screen", "maximize", "minimize", "toggle", "view"],
      icon: isFullScreen ? <Minimize className="size-4 text-muted-foreground" /> : <Maximize className="size-4 text-muted-foreground" />,
      action: () => closeSearchAnd(setGlobalSearchOpen, toggleFullScreen),
    },
  );

  projects.forEach((project) => {
    items.push({
      id: `quick-workspace-${project.id}`,
      type: "new-workspace",
      title: globalSearchItemsT("quickNewWorkspace"),
      description: project.name,
      keywords: ["new", "workspace", "quick", "create", project.name],
      icon: <Zap className="size-4 text-muted-foreground" />,
      action: async () => {
        const jobId = startCreating({ originKey: createOriginKey });
        const workspaceId = await quickAddWorkspace(project.id);
        if (workspaceId) {
          bindWorkspace(jobId, workspaceId);
        } else {
          failCreating(jobId);
        }
        setGlobalSearchOpen(false);
      },
    });

    items.push({
      id: `new-workspace-${project.id}`,
      type: "new-workspace",
      title: globalSearchItemsT("newWorkspace"),
      description: project.name,
      keywords: ["new", "workspace", "create", project.name],
      icon: <Plus className="size-4 text-muted-foreground" />,
      action: () => {
        setSelectedProjectId(project.id);
        setCreateWorkspaceOpen(true);
        setGlobalSearchOpen(false);
      },
    });
  });

  if (currentEffectivePath) {
    QUICK_OPEN_APP_OPTIONS.forEach((option) => {
      items.push({
        id: `quick-open-${option.name}`,
        type: "quick-open",
        title: globalSearchItemsT("quickOpen.title", { label: option.label }),
        description: option.name === "Finder"
          ? globalSearchItemsT("quickOpen.finderDescription")
          : globalSearchItemsT("quickOpen.projectDescription", { label: option.label }),
        keywords: ["open", "external", "app", option.label, option.name, "quick"],
        icon: (
          <QuickOpenAppIcon
            iconName={option.iconName}
            className="size-4"
            themed={option.themed}
          />
        ),
        action: async () => {
          writeQuickOpenLastUsed(option.name);
          try {
            await appApi.openWith(option.name, currentEffectivePath);
          } catch (error) {
            toastManager.add({
              title: globalSearchItemsT("quickOpen.toast.failedTitle"),
              description: error instanceof Error ? error.message : globalSearchItemsT("quickOpen.toast.unknownError"),
              type: "error",
            });
          }
          setGlobalSearchOpen(false);
        },
      });
    });
  }

  return items;
}
