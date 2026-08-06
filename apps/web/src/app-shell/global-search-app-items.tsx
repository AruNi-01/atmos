"use client";

import { createTranslator } from "next-intl";
import {
  Blocks,
  Bot,
  BrainCircuit,
  ChartColumnBig,
  FolderPlus,
  GitCommit,
  Gauge,
  Layers,
  Laptop,
  ListTodo,
  Maximize,
  Minimize,
  Moon,
  Plus,
  Settings,
  SquareKanban,
  Sun,
  Terminal,
  Timer,
  toastManager,
  Zap,
} from "@workspace/ui";
import { HardDrive, Presentation } from "lucide-react";
import { appApi } from "@/api/ws-api";
import type { GithubPrPayload } from "@/api/ws/github-api";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import type { SettingsModalTab } from "@/shared/lib/nuqs/searchParams";
import { writeQuickOpenLastUsed } from "@/shared/stores/use-ui-pref-hooks";
import enMessages from "../../messages/en.json";
import zhMessages from "../../messages/zh.json";
import {
  APP_MAP,
  type AppSearchItem,
} from "@/app-shell/global-search-parts";
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

interface BuildGlobalSearchItemsParams {
  projects: SearchProject[];
  router: RouterLike;
  setTheme: (theme: string) => void;
  setGlobalSearchOpen: (open: boolean) => void;
  setCreateProjectOpen: (open: boolean) => void;
  setSelectedProjectId: (projectId: string) => void;
  setCreateWorkspaceOpen: (open: boolean) => void;
  quickAddWorkspace: (projectId: string) => Promise<string | null | undefined>;
  isFullScreen: boolean;
  toggleFullScreen: () => void;
  currentProject?: SearchProject;
  currentWorkspace?: SearchWorkspace;
  currentWorkspaceId?: string | null;
  currentEffectivePath?: string | null;
  managementTerminalsEnabled: boolean;
  managementAgentsEnabled: boolean;
  automationsEnabled: boolean;
  isLeftCollapsed: boolean;
  setLlmProvidersOpen: (open: boolean) => void;
  setAgentChatOpen: (open: boolean) => void;
  setTokenUsageOpen: (open: boolean) => void;
  setLeftSidebarTab: (tab: "projects") => void;
  setCanvasOpen: (open: boolean) => void;

  setIsLeftCollapsed: (collapsed: boolean) => void;
  setActiveSettingTab: (tab: SettingsModalTab) => void;
  setSettingsOpen: (open: boolean) => void;
  setSubView: (view: "todo" | "commit" | "usage") => void;
  showCreating: () => void;
  showOpening: (workspaceId: string) => void;
  clearWorkspaceCreationOverlay: () => void;
}

export function buildGlobalSearchItems({
  projects,
  router,
  setTheme,
  setGlobalSearchOpen,
  setCreateProjectOpen,
  setSelectedProjectId,
  setCreateWorkspaceOpen,
  quickAddWorkspace,
  isFullScreen,
  toggleFullScreen,
  currentProject,
  currentWorkspace,
  currentWorkspaceId,
  currentEffectivePath,
  managementTerminalsEnabled,
  managementAgentsEnabled,
  automationsEnabled,
  isLeftCollapsed,
  setLlmProvidersOpen,
  setAgentChatOpen,
  setTokenUsageOpen,
  setLeftSidebarTab,
  setCanvasOpen,
  setIsLeftCollapsed,

  setActiveSettingTab,
  setSettingsOpen,
  setSubView,
  showCreating,
  showOpening,
  clearWorkspaceCreationOverlay,
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
      action: () => {
        setTheme("light");
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "theme-dark",
      type: "theme",
      title: globalSearchItemsT("themes.dark"),
      keywords: ["dark", "theme", "appearance", "mode", "night"],
      icon: <Moon className="size-4 text-muted-foreground" />,
      action: () => {
        setTheme("dark");
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "theme-system",
      type: "theme",
      title: globalSearchItemsT("themes.system"),
      keywords: ["system", "theme", "appearance", "auto", "default"],
      icon: <Laptop className="size-4 text-muted-foreground" />,
      action: () => {
        setTheme("system");
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "add-project",
      type: "project",
      title: globalSearchItemsT("addProject"),
      keywords: ["add", "import", "project", "repository", "new", "create", "repo"],
      icon: <FolderPlus className="size-4 text-muted-foreground" />,
      action: () => {
        setCreateProjectOpen(true);
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "management-workspaces",
      type: "management",
      title: globalSearchItemsT("management.workspaces.title"),
      description: globalSearchItemsT("management.workspaces.description"),
      keywords: ["management", "center", "workspaces", "workspace", "admin", "overview"],
      icon: <Layers className="size-4 text-muted-foreground" />,
      action: () => {
        router.push("/workspaces");
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "management-skills",
      type: "management",
      title: globalSearchItemsT("management.skills.title"),
      description: globalSearchItemsT("management.skills.description"),
      keywords: ["management", "center", "skills", "skill", "catalog", "library"],
      icon: <Blocks className="size-4 text-muted-foreground" />,
      action: () => {
        router.push("/skills");
        setGlobalSearchOpen(false);
      },
    },
  );

  if (managementTerminalsEnabled) {
    items.push({
      id: "management-terminals",
      type: "management",
      title: globalSearchItemsT("management.terminals.title"),
      description: globalSearchItemsT("management.terminals.description"),
      keywords: ["management", "center", "terminals", "terminal", "sessions"],
      icon: <Terminal className="size-4 text-muted-foreground" />,
      action: () => {
        router.push("/terminals");
        setGlobalSearchOpen(false);
      },
    });
  }

  if (managementAgentsEnabled) {
    items.push({
      id: "management-agents",
      type: "management",
      title: globalSearchItemsT("management.agents.title"),
      description: globalSearchItemsT("management.agents.description"),
      keywords: ["management", "center", "agents", "agent", "bot", "ai", "chat"],
      icon: <Bot className="size-4 text-muted-foreground" />,
      action: () => {
        router.push("/agents");
        setGlobalSearchOpen(false);
      },
    });

    items.push({
      id: "modal-chat-panel",
      type: "modal",
      title: globalSearchItemsT("modalChat.title"),
      description: globalSearchItemsT("modalChat.description"),
      keywords: ["chat", "agent", "panel", "ai", "assistant", "message", "conversation", "open", "acp"],
      icon: <Bot className="size-4 text-muted-foreground" />,
      action: () => {
        setAgentChatOpen(true);
        setGlobalSearchOpen(false);
      },
    });
  }

  if (automationsEnabled) {
    items.push({
      id: "management-automations",
      type: "management",
      title: globalSearchItemsT("management.automations.title"),
      description: globalSearchItemsT("management.automations.description"),
      keywords: ["management", "center", "automations", "automation", "schedule", "scheduled", "runs"],
      icon: <Timer className="size-4 text-muted-foreground" />,
      action: () => {
        router.push("/automations");
        setGlobalSearchOpen(false);
      },
    });
  }

  items.push({
    id: "management-disk-analyzer",
    type: "management",
    title: globalSearchItemsT("management.diskAnalyzer.title"),
    description: globalSearchItemsT("management.diskAnalyzer.description"),
    keywords: ["management", "center", "disk", "analyzer", "storage", "usage", "cleanup", "trash", "du"],
    icon: <HardDrive className="size-4 text-muted-foreground" />,
    action: () => {
      router.push("/disk-analyzer");
      setGlobalSearchOpen(false);
    },
  });

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
      id: "modal-token-usage",
      type: "modal",
      title: globalSearchItemsT("tokenUsage.title"),
      description: globalSearchItemsT("tokenUsage.description"),
      keywords: ["token", "tokens", "usage", "cost", "analytics", "stats", "model", "activity", "open"],
      icon: <ChartColumnBig className="size-4 text-muted-foreground" />,
      action: () => {
        setTokenUsageOpen(true);
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
      id: "open-kanban-view",
      type: "management",
      title: globalSearchItemsT("kanban.title"),
      description: globalSearchItemsT("kanban.description"),
      keywords: ["kanban", "board", "workspace", "workspaces", "status", "priority", "view", "open"],
      icon: <SquareKanban className="size-4 text-muted-foreground" />,
      action: () => {
        router.push("/kanban");
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "open-canvas",
      type: "management",
      title: globalSearchItemsT("canvas.title"),
      description: globalSearchItemsT("canvas.description"),
      keywords: ["canvas", "board", "whiteboard", "diagram", "tldraw", "open"],
      icon: <Presentation className="size-4 text-muted-foreground" />,
      action: () => {
        setCanvasOpen(true);
        setGlobalSearchOpen(false);
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
        setActiveSettingTab("about");
        setSettingsOpen(true);
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
      action: () => {
        setPendingSettingsHighlight(null);
        setActiveSettingTab(section.id);
        setSettingsOpen(true);
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
        setActiveSettingTab(settingItem.sectionId);
        setSettingsOpen(true);
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

  items.push({
    id: "toggle-fullscreen",
    type: "project",
    title: isFullScreen ? globalSearchItemsT("fullscreen.exit") : globalSearchItemsT("fullscreen.enter"),
    keywords: ["full", "screen", "maximize", "minimize", "toggle", "view"],
    icon: isFullScreen ? <Minimize className="size-4 text-muted-foreground" /> : <Maximize className="size-4 text-muted-foreground" />,
    action: () => {
      toggleFullScreen();
      setGlobalSearchOpen(false);
    },
  });

  projects.forEach((project) => {
    items.push({
      id: `quick-workspace-${project.id}`,
      type: "new-workspace",
      title: globalSearchItemsT("quickNewWorkspace"),
      description: project.name,
      keywords: ["new", "workspace", "quick", "create", project.name],
      icon: <Zap className="size-4 text-muted-foreground" />,
      action: async () => {
        showCreating();
        const workspaceId = await quickAddWorkspace(project.id);
        if (workspaceId) {
          showOpening(workspaceId);
          router.push(`/workspace?id=${workspaceId}`);
        } else {
          clearWorkspaceCreationOverlay();
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
    Object.entries(APP_MAP).forEach(([appName, { icon, label }]) => {
      items.push({
        id: `quick-open-${appName}`,
        type: "quick-open",
        title: globalSearchItemsT("quickOpen.title", { label }),
        description: appName === "Finder" ? globalSearchItemsT("quickOpen.finderDescription") : globalSearchItemsT("quickOpen.projectDescription", { label }),
        keywords: ["open", "external", "app", label, appName, "quick"],
        icon,
        action: async () => {
          writeQuickOpenLastUsed(appName);

          try {
            await appApi.openWith(appName, currentEffectivePath);
            toastManager.add({
              title: globalSearchItemsT("quickOpen.toast.successTitle", { label }),
              description: globalSearchItemsT("quickOpen.toast.pathDescription", { path: currentEffectivePath }),
              type: "success",
            });
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
