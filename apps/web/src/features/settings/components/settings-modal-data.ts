import type { SettingsModalTab } from "@/shared/lib/nuqs/searchParams";
import { createTranslator } from "next-intl";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

export const SETTINGS_SEARCH_HIGHLIGHT_STORAGE_KEY = "atmos:settings-search-highlight";

let cachedSettingsModalLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedSettingsModalTranslator: any = null;

function settingsModalT(key: string): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedSettingsModalTranslator || cachedSettingsModalLocale !== locale) {
    cachedSettingsModalLocale = locale;
    cachedSettingsModalTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "settings.modal",
    });
  }
  try {
    return cachedSettingsModalTranslator(key as never);
  } catch {
    return key;
  }
}

export const SETTINGS_GROUPS = [
  {
    id: "personal",
    label: settingsModalT("groups.personal.label"),
    description: settingsModalT("groups.personal.description"),
    items: ["appearance", "account", "layout", "editor", "canvas", "terminal"] as const,
  },
  {
    id: "coding",
    label: settingsModalT("groups.coding.label"),
    description: settingsModalT("groups.coding.description"),
    items: ["ai", "code-agent", "workspace", "labels"] as const,
  },
  {
    id: "remote-access",
    label: settingsModalT("groups.remoteAccess.label"),
    description: settingsModalT("groups.remoteAccess.description"),
    items: ["atmos-computer", "tunnel-connector"] as const,
  },
  {
    id: "system-integration",
    label: settingsModalT("groups.systemIntegration.label"),
    description: settingsModalT("groups.systemIntegration.description"),
    items: ["integrations", "browser", "desktop-use", "notify"] as const,
  },
  {
    id: "privacy-security",
    label: settingsModalT("groups.privacySecurity.label"),
    description: settingsModalT("groups.privacySecurity.description"),
    items: ["permission-access"] as const,
  },
  {
    id: "more",
    label: settingsModalT("groups.more.label"),
    description: settingsModalT("groups.more.description"),
    items: ["shortcuts", "experiments", "about"] as const,
  },
] as const;

export const SETTINGS_SECTIONS = [
  {
    id: "layout",
    label: settingsModalT("sections.layout.label"),
    description: settingsModalT("sections.layout.description"),
  },
  {
    id: "editor",
    label: settingsModalT("sections.editor.label"),
    description: settingsModalT("sections.editor.description"),
  },
  {
    id: "canvas",
    label: settingsModalT("sections.canvas.label"),
    description: settingsModalT("sections.canvas.description"),
  },
  {
    id: "code-agent",
    label: settingsModalT("sections.codeAgent.label"),
    description: settingsModalT("sections.codeAgent.description"),
  },
  {
    id: "terminal",
    label: settingsModalT("sections.terminal.label"),
    description: settingsModalT("sections.terminal.description"),
  },
  {
    id: "browser",
    label: settingsModalT("sections.browser.label"),
    description: settingsModalT("sections.browser.description"),
  },
  {
    id: "workspace",
    label: settingsModalT("sections.workspace.label"),
    description: settingsModalT("sections.workspace.description"),
  },
  {
    id: "labels",
    label: settingsModalT("sections.labels.label"),
    description: settingsModalT("sections.labels.description"),
  },
  {
    id: "appearance",
    label: settingsModalT("sections.appearance.label"),
    description: settingsModalT("sections.appearance.description"),
  },
  {
    id: "account",
    label: settingsModalT("sections.account.label"),
    description: settingsModalT("sections.account.description"),
  },
  {
    id: "integrations",
    label: settingsModalT("sections.integrations.label"),
    description: settingsModalT("sections.integrations.description"),
  },
  {
    id: "ai",
    label: settingsModalT("sections.ai.label"),
    description: settingsModalT("sections.ai.description"),
  },
  {
    id: "notify",
    label: settingsModalT("sections.notify.label"),
    description: settingsModalT("sections.notify.description"),
  },
  {
    id: "tunnel-connector",
    label: settingsModalT("sections.tunnelConnector.label"),
    description: settingsModalT("sections.tunnelConnector.description"),
  },
  {
    id: "atmos-computer",
    label: settingsModalT("sections.atmosComputer.label"),
    description: settingsModalT("sections.atmosComputer.description"),
  },
  {
    id: "desktop-use",
    label: settingsModalT("sections.desktopUse.label"),
    description: settingsModalT("sections.desktopUse.description"),
  },
  {
    id: "permission-access",
    label: settingsModalT("sections.permissionAccess.label"),
    description: settingsModalT("sections.permissionAccess.description"),
  },
  {
    id: "shortcuts",
    label: settingsModalT("sections.shortcuts.label"),
    description: settingsModalT("sections.shortcuts.description"),
  },
  {
    id: "experiments",
    label: settingsModalT("sections.experiments.label"),
    description: settingsModalT("sections.experiments.description"),
  },
  {
    id: "about",
    label: settingsModalT("sections.about.label"),
    description: settingsModalT("sections.about.description"),
  },
] as const satisfies ReadonlyArray<{
  id: SettingsModalTab;
  label: string;
  description: string;
}>;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

const SECTION_GROUP_TERMS = SETTINGS_GROUPS.reduce(
  (acc, group) => {
    for (const sectionId of group.items) {
      acc[sectionId] = [group.label];
    }
    return acc;
  },
  {} as Record<SettingsSectionId, string[]>,
);

const SETTINGS_SECTION_KEYWORDS: Record<SettingsSectionId, readonly string[]> = {
  appearance: ["theme", "language", "locale", "dark", "light", "system", "appearance"],
  account: ["account", "login", "sign in", "hub", "github", "google", "device", "identity"],
  layout: [
    "layout",
    "panel",
    "sidebar",
    "interface",
    "project files show side",
    "left sidebar",
    "workspace sidebar two-column layout",
    "project sidebar two-column layout",
    "show pinned workspaces in second column",
    "second column uses kanban cards",
    "by time group uses second column",
    "by status group uses second column",
    "by priority group uses second column",
    "by label group uses second column",
    "by group uses second column",
    "header layout",
    "workspace summary button",
    "task section",
    "note section",
    "commit & push section",
    "footer layout",
    "websocket connection status",
    "local services",
    "ai quota usage carousel",
    "agent status panel",
    "launchpad",
    "outside",
    "inside",
    "workspaces",
    "skills",
    "terminals",
    "acp agents",
    "automations",
    "disk analyzer",
    "canvas",
    "prototype design",
    "pt design",
    "tasks",
    "new workspace",
    "acp agent chat entry",
  ],
  editor: [
    "editor",
    "code",
    "diff",
    "code editor",
    "auto save",
    "line wrap",
    "bracket matching",
    "minimap",
    "breadcrumbs",
    "line highlight",
    "git integration",
    "layout",
    "side by side",
    "unified",
    "backgrounds",
    "line numbers",
    "word wrap",
    "indicator style",
    "bar indicators",
    "classic indicators",
    "no indicators",
  ],
  canvas: [
    "canvas",
    "board",
    "tldraw",
    "auto save",
    "auto-save interval",
    "max rendered terminals per canvas page",
    "terminal context lines",
    "terminal context",
    "extract-text",
    "tmux pane",
    "live xterm buffer",
  ],
  "code-agent": [
    "code agent",
    "agent",
    "claude",
    "codex",
    "gemini",
    "antigravity",
    "cursor",
    "grok",
    "grok build",
    "factory droid",
    "kiro",
    "opencode",
    "amp",
    "pi",
    "hermes",
    "built-in agents",
    "custom agents",
    "add agent",
    "command",
    "parameters",
    "run configs",
    "code agent run configs",
    "saved run configs",
    "agent hook status",
    "install hooks",
    "uninstall hooks",
    "behaviour",
    "idle session cleanup",
    "agent activity indicators",
    "activity indicator",
    "status indicator",
    "orbs",
    "unicode spinner",
    "left sidebar indicator",
    "terminal panel indicator",
    "footer agent status",
  ],
  terminal: [
    "terminal",
    "shell",
    "links",
    "file link open mode",
    "open files",
    "open directories",
    "quick open app",
    "finder",
    "atmos",
    "default split agent",
    "split",
    "last split agent",
  ],
  browser: [
    "browser",
    "sidebar",
    "center tabs",
    "homepage",
    "new tab",
    "action overlay",
    "cursor overlay",
    "cookies",
    "import cookies",
    "clear cache",
    "site data",
    "in-app browser",
    "webview",
  ],
  workspace: [
    "workspace",
    "project",
    "delete",
    "cleanup",
    "gitignore",
    "worktree",
    "branch naming",
    "branch prefix",
    "gitignore directories sync",
    "built-in defaults",
    "custom directories",
    "symlink",
    "copy",
    "deletion behavior",
    "close associated pr",
    "close associated issue",
    "delete remote branch",
    "confirm before delete",
    "archive behavior",
    "confirm before archive",
    "kill tmux session",
    "close acp chat session",
  ],
  labels: [
    "labels",
    "tags",
    "workspace labels",
    "filter by name",
    "active labels",
    "deleted labels",
    "manual",
    "github issue",
    "github pr",
    "color",
    "restore",
    "delete labels",
    "source",
  ],
  integrations: [
    "integrations",
    "external",
    "tools",
    "status",
    "github cli",
    "gh",
    "github issues",
    "pull requests",
    "installation status",
    "authentication status",
    "tmux",
    "atmos tmux configuration",
  ],
  ai: [
    "ai",
    "provider",
    "providers",
    "llm",
    "model",
    "openai",
    "anthropic",
    "routing",
    "api keys",
    "endpoints",
    "default models",
    "add provider",
    "provider test",
    "git commit generator",
    "workspace issue todo extraction",
    "language",
    "local model",
    "managed local model",
    "runtime",
  ],
  notify: [
    "notify",
    "notification",
    "notifications",
    "channels",
    "browser notifications",
    "desktop notifications",
    "in-app toast",
    "event triggers",
    "agent permission requested",
    "agent task complete",
    "automation run outcomes",
    "push servers",
    "push automation outcomes",
    "ntfy",
    "bark",
    "gotify",
    "custom webhook",
    "url",
    "token",
    "topic",
    "device key",
    "auth token",
  ],
  "tunnel-connector": [
    "tunnel",
    "connector",
    "tunnel connector",
    "remote",
    "browser",
    "remote browser access",
    "providers",
    "cloudflare",
    "ngrok",
    "auth token",
    "start tunnel",
    "stop tunnel",
    "renew",
    "view tunnel",
    "install",
  ],
  "atmos-computer": [
    "atmos computer",
    "computer",
    "remote",
    "relay",
    "account",
    "sign in",
    "private relay",
    "relay url",
    "token",
    "register computer",
    "register this computer",
    "this computer",
    "my computers",
    "offline",
    "online",
    "remote computer",
    "github routes",
  ],
  "desktop-use": [
    "desktop use",
    "desktop-use",
    "capture",
    "screen recording",
    "accessibility",
    "permissions",
    "control engine",
    "cli",
    "atmos cli",
    "appshot permissions",
    "screenshot",
    "click",
    "type",
  ],
  "permission-access": [
    "permission access",
    "privacy",
    "security",
    "privacy and security",
    "keychain",
    "browser cookie",
    "chrome safe storage",
    "cursor",
    "consent",
    "accessibility",
    "screen recording",
    "desktop use",
  ],
  shortcuts: [
    "shortcuts",
    "keyboard",
    "hotkeys",
    "command palette",
    "global search",
    "quick open file",
    "toggle sidebar",
    "new workspace",
    "canvas overlay",
    "kanban overlay",
    "center stage tabs",
    "split terminal",
    "find in terminal",
    "save current file",
    "find in editor",
    "submit prompt",
    "commit message",
    "diff viewer",
  ],
  experiments: [
    "experiments",
    "preview",
    "feature flags",
    "optional",
    "project wiki",
    "center tabs",
  ],

  about: [
    "about",
    "version",
    "updates",
    "desktop",
    "cli",
    "atmos cli",
    "runtime",
    "check for updates",
    "install cli",
    "app version",
  ],
};

type SettingsSearchItemDefinition = {
  translationKey: string;
  label: string;
  description?: string;
  keywords?: readonly string[];
};

function settingsModalSearchItem(
  key: string,
  options: {
    hasDescription?: boolean;
    keywords?: readonly string[];
  } = {},
): SettingsSearchItemDefinition {
  return {
    translationKey: key,
    label: settingsModalT(`search.items.${key}.label`),
    description: options.hasDescription ? settingsModalT(`search.items.${key}.description`) : undefined,
    keywords: options.keywords,
  };
}

const SETTINGS_SETTING_ITEMS: Record<SettingsSectionId, readonly SettingsSearchItemDefinition[]> = {
  appearance: [
    settingsModalSearchItem("appearance.theme", { keywords: ["theme", "light", "dark", "system"] }),
    settingsModalSearchItem("appearance.language", { keywords: ["language", "locale", "english", "chinese", "zh"] }),
  ],
  account: [],
  layout: [
    settingsModalSearchItem("layout.projectFilesShowSide", {
      hasDescription: true,
      keywords: ["left sidebar", "project file tree", "files column"],
    }),
    settingsModalSearchItem("layout.workspaceSidebarTwoColumnLayout", {
      hasDescription: true,
      keywords: ["project sidebar", "by group", "by time", "by status", "by agent", "by priority", "by label", "second column"],
    }),
    settingsModalSearchItem("layout.projectSidebarTwoColumnLayout", {
      keywords: ["projects in first column", "workspaces in second column"],
    }),
    settingsModalSearchItem("layout.showPinnedWorkspacesInSecondColumn", {
      keywords: ["pinned section", "project two-column layout"],
    }),
    settingsModalSearchItem("layout.secondColumnUsesKanbanCards", {
      keywords: ["tasks", "workspace cards", "properties visibility"],
    }),
    settingsModalSearchItem("layout.byTimeGroupUsesSecondColumn", {
      keywords: ["time grouping", "sidebar by time"],
    }),
    settingsModalSearchItem("layout.byStatusGroupUsesSecondColumn", {
      keywords: ["status grouping", "sidebar by status"],
    }),
    settingsModalSearchItem("layout.byPriorityGroupUsesSecondColumn", {
      keywords: ["priority grouping", "sidebar by priority"],
    }),
    settingsModalSearchItem("layout.byLabelGroupUsesSecondColumn", {
      keywords: ["label grouping", "tag grouping", "sidebar by label", "sidebar by tag"],
    }),
    settingsModalSearchItem("layout.byGroupUsesSecondColumn", {
      keywords: ["group grouping", "sidebar by group", "user groups"],
    }),
    settingsModalSearchItem("layout.byAgentGroupUsesSecondColumn", {
      keywords: ["agent grouping", "sidebar by agent status", "done", "running", "permission", "need attention"],
    }),
    settingsModalSearchItem("layout.headerLayout", {
      keywords: ["workspace utilities", "global search", "header summary"],
    }),

    settingsModalSearchItem("layout.workspaceSummaryButton", {
      keywords: ["project", "task", "note", "commit shortcuts"],
    }),
    settingsModalSearchItem("layout.taskSection", {
      keywords: ["task counts", "summary popover"],
    }),
    settingsModalSearchItem("layout.noteSection", {
      keywords: ["note preview", "markdown editor", "preview popover"],
    }),
    settingsModalSearchItem("layout.commitAndPushSection", {
      keywords: ["repository change status", "commit controls", "push controls"],
    }),
    settingsModalSearchItem("layout.footerLayout", {
      keywords: ["status strips", "app footer"],
    }),
    settingsModalSearchItem("layout.webSocketConnectionStatus", {
      keywords: ["connection state", "active websocket clients"],
    }),
    settingsModalSearchItem("layout.localServices", {
      keywords: ["project local services", "workspace local services"],
    }),
    settingsModalSearchItem("layout.aiQuotaUsageCarousel", {
      keywords: ["usage summaries", "provider picks", "ai usage"],
    }),
    settingsModalSearchItem("layout.agentStatusPanel", {
      keywords: ["running agent sessions", "agent hooks"],
    }),
    settingsModalSearchItem("layout.acpAgentChatEntry", {
      keywords: ["floating acp chat", "footer", "layout", "launchpad"],
    }),
    settingsModalSearchItem("layout.workspacesLaunchpad", {
      keywords: ["workspaces", "manage workspaces", "launchpad"],
    }),
    settingsModalSearchItem("layout.skillsLaunchpad", {
      keywords: ["skills", "manage skills", "launchpad"],
    }),
    settingsModalSearchItem("layout.terminalsLaunchpad", {
      keywords: ["monitor terminal usage", "manage terminal usage", "launchpad"],
    }),
    settingsModalSearchItem("layout.acpAgentsLaunchpad", {
      keywords: ["acp chat panel", "gui agent conversations", "footer", "launchpad"],
    }),
    settingsModalSearchItem("layout.automationsLaunchpad", {
      keywords: ["automation creation", "scheduled runs", "github-triggered automation", "launchpad"],
    }),
    settingsModalSearchItem("layout.diskAnalyzerLaunchpad", {
      keywords: ["disk analyzer", "disk usage", "cleanup", "launchpad"],
    }),
    settingsModalSearchItem("layout.canvasLaunchpad", {
      keywords: ["canvas", "ops desk", "infinite canvas", "launchpad"],
    }),
    settingsModalSearchItem("layout.ptDesignLaunchpad", {
      keywords: ["prototype design", "pt design", "wireframe", "launchpad"],
    }),
    settingsModalSearchItem("layout.tasksLaunchpad", {
      keywords: ["task board", "workspace tasks", "launchpad"],
    }),
    settingsModalSearchItem("layout.newWorkspaceLaunchpad", {
      keywords: ["new workspace", "create workspace", "launchpad"],
    }),
    settingsModalSearchItem("layout.launchpadOutside", {
      keywords: ["outside", "icon name list", "below launchpad", "placement"],
    }),
    settingsModalSearchItem("layout.launchpadInside", {
      keywords: ["inside", "launchpad grid", "placement"],
    }),
  ],
  editor: [
    settingsModalSearchItem("editor.codeEditor", {
      hasDescription: true,
      keywords: ["typing", "navigation", "source code"],
    }),
    settingsModalSearchItem("editor.autoSave", {
      keywords: ["automatically saves", "2 seconds", "current file"],
    }),
    settingsModalSearchItem("editor.lineWrap", {
      keywords: ["wrap long lines", "horizontal scrolling"],
    }),
    settingsModalSearchItem("editor.bracketMatching", {
      keywords: ["matching brackets", "bracket pairs"],
    }),
    settingsModalSearchItem("editor.minimap", {
      keywords: ["right side", "quick navigation"],
    }),
    settingsModalSearchItem("editor.breadcrumbs", {
      keywords: ["breadcrumb navigation", "top of editor"],
    }),
    settingsModalSearchItem("editor.lineHighlight", {
      keywords: ["current line", "matching selections"],
    }),
    settingsModalSearchItem("editor.gitIntegration", {
      keywords: ["git changes", "diff information"],
    }),
    settingsModalSearchItem("editor.diff", {
      keywords: ["default diff layout", "toolbar view options"],
    }),
    settingsModalSearchItem("editor.diffLayout", {
      keywords: ["side by side", "unified", "center review", "pull request diffs"],
    }),
    settingsModalSearchItem("editor.diffBackgrounds", {
      keywords: ["tint added lines", "removed lines"],
    }),
    settingsModalSearchItem("editor.diffLineNumbers", {
      keywords: ["source line numbers", "diff panes"],
    }),
    settingsModalSearchItem("editor.diffWordWrap", {
      keywords: ["wrap long diff lines", "horizontal scrolling"],
    }),
    settingsModalSearchItem("editor.indicatorStyle", {
      keywords: ["changed lines", "gutter", "bar indicators", "classic indicators", "no indicators"],
    }),
  ],
  canvas: [
    settingsModalSearchItem("canvas.autoSaveInterval", {
      keywords: ["automatically saves", "seconds"],
    }),
    settingsModalSearchItem("canvas.maxRenderedTerminalsPerCanvasPage", {
      keywords: ["live terminals", "oldest attached live terminal", "rendering limit"],
    }),
    settingsModalSearchItem("canvas.terminalContextLines", {
      keywords: ["copying a canvas terminal", "extract-text", "tmux pane", "xterm buffer"],
    }),
  ],
  "code-agent": [
    settingsModalSearchItem("codeAgent.builtInAgents", {
      keywords: ["startup command", "parameters", "claude", "codex", "gemini", "antigravity", "grok", "grok build"],
    }),
    settingsModalSearchItem("codeAgent.builtInAgentCommand", {
      keywords: ["command", "startup command"],
    }),
    settingsModalSearchItem("codeAgent.builtInAgentParameters", {
      keywords: ["parameters", "flags", "startup parameters"],
    }),
    settingsModalSearchItem("codeAgent.customAgents", {
      keywords: ["add your own agents", "custom commands", "custom parameters"],
    }),
    settingsModalSearchItem("codeAgent.customAgentName", {
      keywords: ["agent name", "new agent"],
    }),
    settingsModalSearchItem("codeAgent.customAgentCommand", {
      keywords: ["my-agent", "custom command"],
    }),
    settingsModalSearchItem("codeAgent.customAgentParameters", {
      keywords: ["--yolo", "custom flags"],
    }),
    settingsModalSearchItem("codeAgent.codeAgentRunConfigs", {
      keywords: ["saved run configs", "default command presets", "add run config", "edit run config"],
    }),
    settingsModalSearchItem("codeAgent.runConfigName", {
      keywords: ["cursor sonnet high", "config name"],
    }),
    settingsModalSearchItem("codeAgent.runConfigAgent", {
      keywords: ["select an agent", "agent option"],
    }),
    settingsModalSearchItem("codeAgent.agentHookStatus", {
      keywords: ["install hooks", "uninstall hooks", "running state", "tool configs"],
    }),
    settingsModalSearchItem("codeAgent.behaviour", {
      keywords: ["idle agent sessions", "managed in memory"],
    }),
    settingsModalSearchItem("codeAgent.idleSessionCleanup", {
      keywords: ["remove idle agent sessions", "every 5 minutes", "timeout"],
    }),
  ],
  browser: [
    settingsModalSearchItem("browser.agentChrome", {
      keywords: ["action overlay", "cursor overlay", "highlight", "click"],
    }),
    settingsModalSearchItem("browser.cookiesImport", {
      keywords: ["import cookies", "chrome", "edge", "brave", "firefox", "sign-in"],
    }),
    settingsModalSearchItem("browser.cookiesClearCache", {
      keywords: ["clear cache", "cached files"],
    }),
    settingsModalSearchItem("browser.cookiesClearSiteData", {
      keywords: ["clear cookies", "delete cookies", "storage", "sign out"],
    }),
  ],
  terminal: [
    settingsModalSearchItem("terminal.fileLinkOpenMode", {
      keywords: ["terminal file links", "directory links", "atmos", "finder", "quick open app"],
    }),
    settingsModalSearchItem("terminal.quickOpenApp", {
      keywords: ["external app", "finder", "terminal", "cursor", "zed", "vs code"],
    }),
    settingsModalSearchItem("terminal.defaultSplitAgent", {
      keywords: [
        "split terminal",
        "default agent",
        "run config",
        "new terminal tab",
        "toolbar click",
        "command d",
        "context menu",
      ],
    }),
    settingsModalSearchItem("terminal.richInputEnabled", {
      keywords: [
        "terminal rich input",
        "agent input",
        "command g",
        "prompt composer",
        "terminal input",
      ],
    }),
    settingsModalSearchItem("terminal.richInputTriggerBar", {
      keywords: [
        "trigger bar",
        "handle",
        "hover bar",
        "rich input bar",
        "hide bar",
        "command g",
      ],
    }),
    settingsModalSearchItem("terminal.sideContextBudget", {
      keywords: ["/side", "side chat", "context budget", "prompt bytes", "terminal capture"],
    }),
  ],
  workspace: [
    settingsModalSearchItem("workspace.branchNaming", {
      keywords: ["git branch prefix", "new workspace branches"],
    }),
    settingsModalSearchItem("workspace.branchPrefix", {
      keywords: ["workspace branches", "prefix"],
    }),
    settingsModalSearchItem("workspace.gitignoreDirectoriesSync", {
      keywords: ["git worktree add", ".gitignore", "symlink", "copy", "project root"],
    }),
    settingsModalSearchItem("workspace.gitignoreBuiltInDefaults", {
      keywords: ["built-in defaults", "symlink", "copy", "off"],
    }),
    settingsModalSearchItem("workspace.gitignoreCustomDirectories", {
      keywords: ["custom directories", "relative path", "project root"],
    }),
    settingsModalSearchItem("workspace.deletionBehavior", {
      keywords: ["workspace delete", "project deletion"],
    }),
    settingsModalSearchItem("workspace.closeAssociatedPr", {
      keywords: ["github pull request", "delete workspace"],
    }),
    settingsModalSearchItem("workspace.closeAssociatedIssue", {
      keywords: ["github issue", "delete workspace"],
    }),
    settingsModalSearchItem("workspace.deleteRemoteBranch", {
      keywords: ["github branch", "remote branch"],
    }),
    settingsModalSearchItem("workspace.confirmBeforeDelete", {
      keywords: ["confirmation dialog", "delete workspace"],
    }),
    settingsModalSearchItem("workspace.archiveBehavior", {
      keywords: ["workspace archive", "restore later"],
    }),
    settingsModalSearchItem("workspace.confirmBeforeArchive", {
      keywords: ["confirmation dialog", "archive workspace"],
    }),
    settingsModalSearchItem("workspace.killTmuxSession", {
      keywords: ["terminate tmux", "pty processes", "archive"],
    }),
    settingsModalSearchItem("workspace.closeAcpChatSession", {
      keywords: ["agent chat sessions", "archive workspace"],
    }),
  ],
  labels: [
    settingsModalSearchItem("labels.filterByName", {
      keywords: ["label search", "label name"],
    }),
    settingsModalSearchItem("labels.activeLabels", {
      keywords: ["active", "workspace labels"],
    }),
    settingsModalSearchItem("labels.deletedLabels", {
      keywords: ["deleted", "restore label"],
    }),
    settingsModalSearchItem("labels.labelSource", {
      keywords: ["manual", "github issue", "github pr"],
    }),
    settingsModalSearchItem("labels.labelColor", {
      keywords: ["swatch", "workspace label color"],
    }),
    settingsModalSearchItem("labels.deleteLabels", {
      keywords: ["batch delete", "delete selected labels"],
    }),
    settingsModalSearchItem("labels.restoreLabels", {
      keywords: ["restore deleted label"],
    }),
  ],
  integrations: [
    settingsModalSearchItem("integrations.githubCli", {
      keywords: ["gh", "github issues", "pull requests", "workflows"],
    }),
    settingsModalSearchItem("integrations.githubCliInstallationStatus", {
      keywords: ["installed", "not installed", "install github cli"],
    }),
    settingsModalSearchItem("integrations.githubCliAuthenticationStatus", {
      keywords: ["authenticated", "not authenticated", "gh auth login"],
    }),
    settingsModalSearchItem("integrations.githubApiRateLimits", {
      keywords: [
        "rate limit",
        "api quota",
        "graphql",
        "search api",
        "rest core",
        "github usage",
      ],
    }),
    settingsModalSearchItem("integrations.tmux", {
      keywords: ["terminal sessions", "tmux server"],
    }),
    settingsModalSearchItem("integrations.tmuxInstallationStatus", {
      keywords: ["installed tmux", "not installed"],
    }),
    settingsModalSearchItem("integrations.atmosTmuxConfiguration", {
      keywords: ["~/.atmos/atmos.sock", "terminal persistence", "session management"],
    }),
  ],
  ai: [
    settingsModalSearchItem("ai.providers", {
      keywords: ["api keys", "endpoints", "default models", "background tasks", "add provider"],
    }),
    settingsModalSearchItem("ai.providerTest", {
      keywords: ["test provider", "retest", "streaming response"],
    }),
    settingsModalSearchItem("ai.providerEnabled", {
      keywords: ["enable provider", "disable provider"],
    }),
    settingsModalSearchItem("ai.routing", {
      keywords: ["choose provider", "tasks", "feature select"],
    }),
    settingsModalSearchItem("ai.gitCommitGenerator", {
      keywords: ["commit message", "language", "prompt default"],
    }),
    settingsModalSearchItem("ai.workspaceIssueTodoExtraction", {
      keywords: ["todo extraction", "workspace issue", "language"],
    }),
    settingsModalSearchItem("ai.localModel", {
      keywords: ["on-device", "no api key", "managed local model", "runtime"],
    }),
  ],
  notify: [
    settingsModalSearchItem("notify.notificationChannels", {
      keywords: ["agents need attention", "notification channel"],
    }),
    settingsModalSearchItem("notify.browserNotifications", {
      keywords: ["native browser notifications", "agents need attention", "test browser"],
    }),
    settingsModalSearchItem("notify.desktopNotifications", {
      keywords: ["system-level notifications", "desktop app", "test desktop"],
    }),
    settingsModalSearchItem("notify.inAppToast", {
      keywords: ["top-right app toasts", "agents need attention", "finish"],
    }),
    settingsModalSearchItem("notify.eventTriggers", {
      keywords: ["agent events", "trigger notifications"],
    }),
    settingsModalSearchItem("notify.agentPermissionRequested", {
      keywords: ["approval", "waiting for approval"],
    }),
    settingsModalSearchItem("notify.agentTaskComplete", {
      keywords: ["agent finishes", "running idle"],
    }),
    settingsModalSearchItem("notify.automationRunOutcomes", {
      keywords: ["automation completes", "fails", "cancelled", "interrupted"],
    }),
    settingsModalSearchItem("notify.pushServers", {
      keywords: ["self-hosted push", "ntfy", "bark", "gotify", "custom webhooks"],
    }),
    settingsModalSearchItem("notify.pushAutomationOutcomes", {
      keywords: ["forward automation outcome notifications", "push servers"],
    }),
    settingsModalSearchItem("notify.pushServerUrl", {
      keywords: ["https", "webhook url", "ntfy url", "gotify url"],
    }),
    settingsModalSearchItem("notify.pushServerToken", {
      keywords: ["auth token", "optional auth token"],
    }),
    settingsModalSearchItem("notify.pushServerTopic", {
      keywords: ["ntfy topic"],
    }),
    settingsModalSearchItem("notify.pushServerDeviceKey", {
      keywords: ["bark device key"],
    }),
  ],
  "tunnel-connector": [
    settingsModalSearchItem("tunnelConnector.providers", {
      keywords: ["remote browser access", "local atmos instance"],
    }),
    settingsModalSearchItem("tunnelConnector.cloudflareTunnel", {
      keywords: ["cloudflare", "install", "authenticate", "start tunnel"],
    }),
    settingsModalSearchItem("tunnelConnector.ngrokTunnel", {
      keywords: ["ngrok", "auth token", "configure token", "start tunnel"],
    }),
    settingsModalSearchItem("tunnelConnector.authToken", {
      keywords: ["paste auth token", "configure token"],
    }),
    settingsModalSearchItem("tunnelConnector.startTunnel", {
      keywords: ["start tunnel", "remote browser"],
    }),
    settingsModalSearchItem("tunnelConnector.stopTunnel", {
      keywords: ["stop tunnel", "remote browser"],
    }),
    settingsModalSearchItem("tunnelConnector.viewTunnel", {
      keywords: ["view tunnel", "renew tunnel", "reuse token"],
    }),
  ],
  "desktop-use": [
    settingsModalSearchItem("desktopUse.cli", {
      keywords: [
        "atmos cli",
        "cli",
        "install cli",
        "update cli",
      ],
    }),
    settingsModalSearchItem("desktopUse.engine", {
      keywords: [
        "control engine",
        "install",
        "ensure",
        "download",
        "stop",
        "uninstall",
      ],
    }),
    settingsModalSearchItem("desktopUse.permissions", {
      keywords: ["screen recording", "accessibility", "macos permissions"],
    }),
    settingsModalSearchItem("desktopUse.border", {
      keywords: [
        "operation border",
        "visual feedback",
        "highlight",
        "chrome",
      ],
    }),
  ],
  "atmos-computer": [
    settingsModalSearchItem("atmosComputer.accountRequired", {
      keywords: ["sign in", "account", "hub device", "login required"],
    }),
    settingsModalSearchItem("atmosComputer.mobilePair", {
      keywords: ["pair phone", "qr code", "mobile", "scan"],
    }),
    settingsModalSearchItem("atmosComputer.privateRelay", {
      keywords: ["self-hosted relay", "official atmos relay"],
    }),
    settingsModalSearchItem("atmosComputer.relayUrl", {
      keywords: ["https://relay.atmos.land", "private relay url"],
    }),
    settingsModalSearchItem("atmosComputer.privateRelayToken", {
      keywords: ["relay authentication", "secret key", "x-atmos-relay-secret"],
    }),
    settingsModalSearchItem("atmosComputer.registerComputer", {
      keywords: ["remote computer", "network", "cloud", "registration code"],
    }),
    settingsModalSearchItem("atmosComputer.registerAndStartOneComputer", {
      keywords: ["remote computer setup command", "register token"],
    }),
    settingsModalSearchItem("atmosComputer.thisComputer", {
      keywords: ["register this computer", "online", "offline", "relay reconnect"],
    }),
    settingsModalSearchItem("atmosComputer.myComputers", {
      keywords: ["computers linked", "refresh", "remove computer", "connect"],
    }),
  ],
  shortcuts: [
    settingsModalSearchItem("shortcuts.globalShortcuts", {
      keywords: [
        "toggle left sidebar",
        "command palette",
        "global search",
        "quick open file",
        "need attention",
        "attention filter",
      ],
    }),
    settingsModalSearchItem("shortcuts.workspaceShortcuts", {
      keywords: ["new workspace overlay", "canvas overlay", "task board", "open create workspace"],
    }),
    settingsModalSearchItem("shortcuts.centerStageTabsShortcuts", {
      keywords: ["overview tab", "fixed terminal tab", "terminal tab"],
    }),
    settingsModalSearchItem("shortcuts.terminalShortcuts", {
      keywords: ["split terminal", "new terminal tab", "close terminal pane", "find in terminal"],
    }),
    settingsModalSearchItem("shortcuts.appshotsShortcuts", {
      keywords: ["capture focused app", "appshot"],
    }),
    settingsModalSearchItem("shortcuts.editorShortcuts", {
      keywords: ["save current file", "find in editor"],
    }),
    settingsModalSearchItem("shortcuts.submitAndCommitShortcuts", {
      keywords: ["submit prompt", "commit message"],
    }),
    settingsModalSearchItem("shortcuts.diffViewerShortcuts", {
      keywords: ["multi-select lines", "annotation"],
    }),
  ],
  experiments: [
    settingsModalSearchItem("experiments.projectWikiCenterTabs", {
      keywords: ["project documentation", "knowledge base", "center stage tab"],
    }),
  ],

  "permission-access": [
    settingsModalSearchItem("permissionAccess.browserCookies", {
      hasDescription: true,
      keywords: ["keychain", "chrome safe storage", "cursor", "cookie"],
    }),
  ],
  about: [
    settingsModalSearchItem("about.runtime", {
      keywords: ["web", "desktop", "runtime"],
    }),
    settingsModalSearchItem("about.version", {
      keywords: ["app version", "desktop version"],
    }),
    settingsModalSearchItem("about.atmosCli", {
      keywords: [
        "atmos cli",
        "cli version",
        "install cli",
        "check cli version",
        "cli",
      ],
    }),
    settingsModalSearchItem("about.checkForUpdates", {
      keywords: ["desktop updates", "check update"],
    }),
  ],
};

const slugSettingSearchId = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";

const sectionById = Object.fromEntries(
  SETTINGS_SECTIONS.map((section) => [section.id, section]),
) as Record<SettingsSectionId, (typeof SETTINGS_SECTIONS)[number]>;

export const SETTINGS_SEARCH_ITEMS = Object.entries(SETTINGS_SETTING_ITEMS).flatMap(
  ([sectionId, settingItems]) => {
    const typedSectionId = sectionId as SettingsSectionId;
    const section = sectionById[typedSectionId];

    return settingItems.map((item, index) => ({
      id: `${typedSectionId}-${slugSettingSearchId(item.label)}-${index}`,
      sectionId: typedSectionId,
      sectionLabel: section.label,
      label: item.label,
      description: item.description ?? section.description,
      translationKey: item.translationKey,
      keywords: [
        item.label,
        item.description ?? "",
        section.id,
        section.label,
        section.description,
        ...(SECTION_GROUP_TERMS[typedSectionId] ?? []),
        ...(item.keywords ?? []),
      ].filter(Boolean),
    }));
  },
);

export const SETTINGS_SEARCH_SECTIONS = SETTINGS_SECTIONS.map((section) => ({
  ...section,
  keywords: [
    section.id,
    section.label,
    section.description,
    ...(SECTION_GROUP_TERMS[section.id] ?? []),
    ...SETTINGS_SECTION_KEYWORDS[section.id],
    ...SETTINGS_SEARCH_ITEMS
      .filter((item) => item.sectionId === section.id)
      .flatMap((item) => [item.label, item.description, ...item.keywords]),
  ],
}));

export const SETTINGS_SEARCH_ENTRIES = [
  ...SETTINGS_SEARCH_SECTIONS.map((section) => ({
    id: section.id,
    sectionId: section.id,
    sectionLabel: section.label,
    label: section.label,
    description: section.description,
    keywords: section.keywords,
    kind: "section" as const,
    translationKey: undefined,
  })),
  ...SETTINGS_SEARCH_ITEMS.map((item) => ({
    ...item,
    kind: "item" as const,
  })),
];
