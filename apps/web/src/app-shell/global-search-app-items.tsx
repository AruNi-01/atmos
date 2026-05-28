"use client";

import {
  Blocks,
  Bot,
  BrainCircuit,
  ChartColumnBig,
  FolderPlus,
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
import { appApi } from "@/api/ws-api";
import { writeQuickOpenLastUsed } from "@/shared/stores/use-ui-pref-hooks";
import {
  APP_MAP,
  type AppSearchItem,
} from "@/app-shell/global-search-parts";

type RouterLike = {
  push: (href: string) => void;
};

interface SearchWorkspace {
  id: string;
  name: string;
  branch: string;
  localPath?: string | null;
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
  isLeftCollapsed: boolean;
  setLlmProvidersOpen: (open: boolean) => void;
  setAgentChatOpen: (open: boolean) => void;
  setTokenUsageOpen: (open: boolean) => void;
  setLeftSidebarTab: (tab: "projects") => void;
  setKanbanExpanded: (expanded: boolean) => void;
  setIsLeftCollapsed: (collapsed: boolean) => void;
  setActiveSettingTab: (tab: "about") => void;
  setSettingsOpen: (open: boolean) => void;
  setSubView: (view: "todo" | "usage") => void;
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
  isLeftCollapsed,
  setLlmProvidersOpen,
  setAgentChatOpen,
  setTokenUsageOpen,
  setLeftSidebarTab,
  setKanbanExpanded,
  setIsLeftCollapsed,
  setActiveSettingTab,
  setSettingsOpen,
  setSubView,
  showCreating,
  showOpening,
  clearWorkspaceCreationOverlay,
}: BuildGlobalSearchItemsParams): AppSearchItem[] {
  const items: AppSearchItem[] = [];

  projects.forEach((project) => {
    project.workspaces.forEach((workspace) => {
      items.push({
        id: `workspace-${workspace.id}`,
        type: "workspace",
        title: workspace.name,
        description: `${project.name} · ${workspace.branch}`,
        keywords: [
          "workspace",
          workspace.name,
          project.name,
          workspace.branch,
          ...workspace.name.split(/[-_/]/),
          ...project.name.split(/[-_/]/),
          ...workspace.branch.split(/[-_/]/),
        ].filter(Boolean),
        icon: <Layers className="size-4 text-muted-foreground" />,
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
      title: "Light Theme",
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
      title: "Dark Theme",
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
      title: "System Theme",
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
      title: "Add Project",
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
      title: "Management Center: Workspaces",
      description: "Open workspace management",
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
      title: "Management Center: Skills",
      description: "Open skills management",
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
      title: "Management Center: Terminals",
      description: "Open terminal management",
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
      title: "Management Center: Agents",
      description: "Open agent management",
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
      title: "Open ACP Chat",
      description: "Toggle the ACP Chat panel",
      keywords: ["chat", "agent", "panel", "ai", "assistant", "message", "conversation", "open", "acp"],
      icon: <Bot className="size-4 text-muted-foreground" />,
      action: () => {
        setAgentChatOpen(true);
        setGlobalSearchOpen(false);
      },
    });
  }

  items.push(
    {
      id: "management-automations",
      type: "management",
      title: "Management Center: Automations",
      description: "Open automation management",
      keywords: ["management", "center", "automations", "automation", "schedule", "scheduled", "runs"],
      icon: <Timer className="size-4 text-muted-foreground" />,
      action: () => {
        router.push("/automations");
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "modal-llm-providers",
      type: "modal",
      title: "Open LLM Providers",
      description: "Configure LLM provider API keys and models",
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
      title: "Open Token Usage",
      description: "Review model token usage and activity",
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
      title: "AI Quota Usage",
      description: "Inspect provider quotas and refresh status",
      keywords: ["ai", "quota", "usage", "provider", "providers", "limit", "limits", "refresh", "open"],
      icon: <Gauge className="size-4 text-muted-foreground" />,
      action: () => {
        setSubView("usage");
      },
    },
    {
      id: "open-kanban-view",
      type: "management",
      title: "Open Kanban View",
      description: "Open the workspace kanban board",
      keywords: ["kanban", "board", "workspace", "workspaces", "status", "priority", "view", "open"],
      icon: <SquareKanban className="size-4 text-muted-foreground" />,
      action: () => {
        setLeftSidebarTab("projects");
        setKanbanExpanded(true);
        if (isLeftCollapsed) {
          setIsLeftCollapsed(false);
        }
        setGlobalSearchOpen(false);
      },
    },
    {
      id: "modal-settings",
      type: "modal",
      title: "Open Setting",
      description: "Open app settings",
      keywords: ["setting", "settings", "preferences", "configure", "config", "open"],
      icon: <Settings className="size-4 text-muted-foreground" />,
      action: () => {
        setActiveSettingTab("about");
        setSettingsOpen(true);
        setGlobalSearchOpen(false);
      },
    },
  );

  if (currentWorkspaceId || currentProject) {
    const todoLabel = currentWorkspace ? currentWorkspace.name : currentProject?.name;
    items.push({
      id: "todo-current-workspace",
      type: "todo",
      title: "Workspace TODOs",
      description: todoLabel ? `${todoLabel} — View tasks` : "View current tasks",
      keywords: ["todo", "task", "tasks", "checklist", "workspace", "project", "overview", "plan"],
      icon: <ListTodo className="size-4 text-muted-foreground" />,
      action: () => {
        setSubView("todo");
      },
    });
  }

  items.push({
    id: "toggle-fullscreen",
    type: "project",
    title: isFullScreen ? "Exit Full Screen" : "Enter Full Screen",
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
      title: "Quick New Workspace",
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
      title: "New Workspace",
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
        title: `Open in ${label}`,
        description: appName === "Finder" ? "Reveal in Finder" : `Open project in ${label}`,
        keywords: ["open", "external", "app", label, appName, "quick"],
        icon,
        action: async () => {
          writeQuickOpenLastUsed(appName);

          try {
            await appApi.openWith(appName, currentEffectivePath);
            toastManager.add({
              title: `Opened in ${label}`,
              description: `Path: ${currentEffectivePath}`,
              type: "success",
            });
          } catch (error) {
            toastManager.add({
              title: "Failed to open",
              description: error instanceof Error ? error.message : "Unknown error",
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
