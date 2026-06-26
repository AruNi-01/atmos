import type { SettingsModalTab } from "@/shared/lib/nuqs/searchParams";

export const SETTINGS_SEARCH_HIGHLIGHT_STORAGE_KEY = "atmos:settings-search-highlight";

export const SETTINGS_GROUPS = [
  {
    id: "interface",
    label: "Interface",
    description: "Layout, editor, canvas, and keyboard preferences",
    items: ["layout", "editor", "canvas", "terminal"] as const,
  },
  {
    id: "ai-agents",
    label: "AI & Agents",
    description: "AI providers and code agent configurations",
    items: ["ai", "code-agent"] as const,
  },
  {
    id: "system-integration",
    label: "System & Integration",
    description: "Integrations, Tunnel Connector, and notifications",
    items: ["integrations", "tunnel-connector", "atmos-computer", "notify"] as const,
  },
  {
    id: "workspace-projects",
    label: "Workspace & Projects",
    description: "Workspace management and labels",
    items: ["workspace", "labels"] as const,
  },
  {
    id: "more",
    label: "More",
    description: "Shortcuts, experiments, and about",
    items: ["shortcuts", "experiments", "about"] as const,
  },
] as const;

export const SETTINGS_SECTIONS = [
  {
    id: "layout",
    label: "Layout",
    description: "Panel arrangement and sidebar preferences",
  },
  {
    id: "editor",
    label: "Editor",
    description: "Code editor preferences and features",
  },
  {
    id: "canvas",
    label: "Canvas",
    description: "Canvas board preferences and auto-save behavior",
  },
  {
    id: "code-agent",
    label: "Code Agent",
    description: "Agent startup commands and custom parameters",
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Terminal preferences and link behavior",
  },
  {
    id: "workspace",
    label: "Workspace",
    description: "Deletion behavior and cleanup options",
  },
  {
    id: "labels",
    label: "Labels",
    description: "Manage workspace labels and their properties",
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "External tool integrations and status",
  },
  {
    id: "ai",
    label: "AI & Provider",
    description: "Providers and lightweight task routing",
  },
  {
    id: "notify",
    label: "Notify",
    description: "Notification channels and agent event triggers",
  },
  {
    id: "tunnel-connector",
    label: "Tunnel Connector",
    description: "Tunnel providers and remote browser access",
  },
  {
    id: "atmos-computer",
    label: "Atmos Computer",
    description: "Connect to your computers from anywhere",
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    description: "Keyboard shortcuts across the application",
  },
  {
    id: "experiments",
    label: "Experiments",
    description: "Optional and preview features disabled by default",
  },
  {
    id: "about",
    label: "About",
    description: "Product overview and desktop updates",
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
  layout: [
    "layout",
    "panel",
    "sidebar",
    "interface",
    "project files show side",
    "left sidebar",
    "right sidebar",
    "workspace sidebar two-column layout",
    "project sidebar two-column layout",
    "show pinned workspaces in second column",
    "second column uses kanban cards",
    "by time group uses second column",
    "by status group uses second column",
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
    "cursor",
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
    "access token",
    "access key",
    "private relay",
    "relay url",
    "token",
    "rotate access token",
    "switch identity",
    "register computer",
    "register this computer",
    "this computer",
    "my computers",
    "offline",
    "online",
    "remote computer",
    "github routes",
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
    "management center",
    "terminals",
    "acp agents",
    "footer acp chat",
    "automations",
    "project wiki",
    "center tabs",
  ],
  about: [
    "about",
    "version",
    "updates",
    "desktop",
    "cli",
    "runtime",
    "atmos cli",
    "check for updates",
    "install cli",
    "app version",
  ],
};

type SettingsSearchItemDefinition = {
  label: string;
  description?: string;
  keywords?: readonly string[];
};

const SETTINGS_SETTING_ITEMS: Record<SettingsSectionId, readonly SettingsSearchItemDefinition[]> = {
  layout: [
    {
      label: "Project Files show side",
      description: "Choose which sidebar displays the project file tree.",
      keywords: ["left sidebar", "right sidebar", "project file tree"],
    },
    {
      label: "Workspace Sidebar Two-Column Layout",
      description: "Configure optional two-column workspace browser modes.",
      keywords: ["project sidebar", "by time", "by status", "second column"],
    },
    {
      label: "Project sidebar two-column layout",
      keywords: ["projects in first column", "workspaces in second column"],
    },
    {
      label: "Show pinned workspaces in second column",
      keywords: ["pinned section", "project two-column layout"],
    },
    {
      label: "Second column uses Kanban cards",
      keywords: ["kanban", "workspace cards", "properties visibility"],
    },
    {
      label: "By Time group uses second column",
      keywords: ["time grouping", "sidebar by time"],
    },
    {
      label: "By Status group uses second column",
      keywords: ["status grouping", "sidebar by status"],
    },
    {
      label: "Header layout",
      keywords: ["workspace utilities", "global search", "header summary"],
    },
    {
      label: "Workspace summary button",
      keywords: ["project", "task", "note", "commit shortcuts"],
    },
    {
      label: "TASK section",
      keywords: ["task counts", "summary popover"],
    },
    {
      label: "NOTE section",
      keywords: ["note preview", "markdown editor", "preview popover"],
    },
    {
      label: "Commit & Push section",
      keywords: ["repository change status", "commit controls", "push controls"],
    },
    {
      label: "Footer layout",
      keywords: ["status strips", "app footer"],
    },
    {
      label: "WebSocket connection status",
      keywords: ["connection state", "active websocket clients"],
    },
    {
      label: "Local Services",
      keywords: ["project local services", "workspace local services"],
    },
    {
      label: "AI Quota Usage carousel",
      keywords: ["usage summaries", "provider picks", "ai usage"],
    },
    {
      label: "Agent Status Panel",
      keywords: ["running agent sessions", "agent hooks"],
    },
    {
      label: "ACP Agent Chat entry",
      keywords: ["floating acp chat", "footer", "experiments"],
    },
  ],
  editor: [
    {
      label: "Code Editor",
      description: "Configure typing, navigation, and inline source-code affordances.",
      keywords: ["typing", "navigation", "source code"],
    },
    {
      label: "Auto Save",
      keywords: ["automatically saves", "2 seconds", "current file"],
    },
    {
      label: "Line Wrap",
      keywords: ["wrap long lines", "horizontal scrolling"],
    },
    {
      label: "Bracket Matching",
      keywords: ["matching brackets", "bracket pairs"],
    },
    {
      label: "Minimap",
      keywords: ["right side", "quick navigation"],
    },
    {
      label: "Breadcrumbs",
      keywords: ["breadcrumb navigation", "top of editor"],
    },
    {
      label: "Line Highlight",
      keywords: ["current line", "matching selections"],
    },
    {
      label: "Git Integration",
      keywords: ["git changes", "diff information"],
    },
    {
      label: "Diff",
      keywords: ["default diff layout", "toolbar view options"],
    },
    {
      label: "Diff layout",
      keywords: ["side by side", "unified", "center review", "pull request diffs"],
    },
    {
      label: "Diff backgrounds",
      keywords: ["tint added lines", "removed lines"],
    },
    {
      label: "Diff line numbers",
      keywords: ["source line numbers", "diff panes"],
    },
    {
      label: "Diff word wrap",
      keywords: ["wrap long diff lines", "horizontal scrolling"],
    },
    {
      label: "Indicator Style",
      keywords: ["changed lines", "gutter", "bar indicators", "classic indicators", "no indicators"],
    },
  ],
  canvas: [
    {
      label: "Auto-save Interval",
      keywords: ["automatically saves", "seconds"],
    },
    {
      label: "Max rendered terminals per canvas page",
      keywords: ["live terminals", "oldest attached live terminal", "rendering limit"],
    },
    {
      label: "Terminal context lines",
      keywords: ["copying a canvas terminal", "extract-text", "tmux pane", "xterm buffer"],
    },
  ],
  "code-agent": [
    {
      label: "Built-in Agents",
      keywords: ["startup command", "parameters", "claude", "codex", "gemini"],
    },
    {
      label: "Built-in agent command",
      keywords: ["command", "startup command"],
    },
    {
      label: "Built-in agent parameters",
      keywords: ["parameters", "flags", "startup parameters"],
    },
    {
      label: "Custom Agents",
      keywords: ["add your own agents", "custom commands", "custom parameters"],
    },
    {
      label: "Custom agent name",
      keywords: ["agent name", "new agent"],
    },
    {
      label: "Custom agent command",
      keywords: ["my-agent", "custom command"],
    },
    {
      label: "Custom agent parameters",
      keywords: ["--yolo", "custom flags"],
    },
    {
      label: "Code Agent Run Configs",
      keywords: ["saved run configs", "default command presets", "add run config", "edit run config"],
    },
    {
      label: "Run Config name",
      keywords: ["cursor sonnet high", "config name"],
    },
    {
      label: "Run Config agent",
      keywords: ["select an agent", "agent option"],
    },
    {
      label: "Agent Hook Status",
      keywords: ["install hooks", "uninstall hooks", "running state", "tool configs"],
    },
    {
      label: "Behaviour",
      keywords: ["idle agent sessions", "managed in memory"],
    },
    {
      label: "Idle session cleanup",
      keywords: ["remove idle agent sessions", "every 5 minutes", "timeout"],
    },
  ],
  terminal: [
    {
      label: "File link open mode",
      keywords: ["terminal file links", "directory links", "atmos", "finder", "quick open app"],
    },
    {
      label: "Quick Open App",
      keywords: ["external app", "finder", "terminal", "cursor", "zed", "vs code"],
    },
    {
      label: "Default split agent",
      keywords: ["split terminal", "last agent", "toolbar click", "command d", "context menu"],
    },
  ],
  workspace: [
    {
      label: "Branch Naming",
      keywords: ["git branch prefix", "new workspace branches"],
    },
    {
      label: "Branch prefix",
      keywords: ["workspace branches", "prefix"],
    },
    {
      label: "GitIgnore Directories Sync",
      keywords: ["git worktree add", ".gitignore", "symlink", "copy", "project root"],
    },
    {
      label: "GitIgnore built-in defaults",
      keywords: ["built-in defaults", "symlink", "copy", "off"],
    },
    {
      label: "GitIgnore custom directories",
      keywords: ["custom directories", "relative path", "project root"],
    },
    {
      label: "Deletion Behavior",
      keywords: ["workspace delete", "project deletion"],
    },
    {
      label: "Close associated PR",
      keywords: ["github pull request", "delete workspace"],
    },
    {
      label: "Close associated Issue",
      keywords: ["github issue", "delete workspace"],
    },
    {
      label: "Delete remote branch",
      keywords: ["github branch", "remote branch"],
    },
    {
      label: "Confirm before delete",
      keywords: ["confirmation dialog", "delete workspace"],
    },
    {
      label: "Archive Behavior",
      keywords: ["workspace archive", "restore later"],
    },
    {
      label: "Confirm before archive",
      keywords: ["confirmation dialog", "archive workspace"],
    },
    {
      label: "Kill tmux session",
      keywords: ["terminate tmux", "pty processes", "archive"],
    },
    {
      label: "Close ACP Chat Session",
      keywords: ["agent chat sessions", "archive workspace"],
    },
  ],
  labels: [
    {
      label: "Filter by name",
      keywords: ["label search", "label name"],
    },
    {
      label: "Active labels",
      keywords: ["active", "workspace labels"],
    },
    {
      label: "Deleted labels",
      keywords: ["deleted", "restore label"],
    },
    {
      label: "Label source",
      keywords: ["manual", "github issue", "github pr"],
    },
    {
      label: "Label color",
      keywords: ["swatch", "workspace label color"],
    },
    {
      label: "Delete labels",
      keywords: ["batch delete", "delete selected labels"],
    },
    {
      label: "Restore labels",
      keywords: ["restore deleted label"],
    },
  ],
  integrations: [
    {
      label: "GitHub CLI",
      keywords: ["gh", "github issues", "pull requests", "workflows"],
    },
    {
      label: "GitHub CLI Installation Status",
      keywords: ["installed", "not installed", "install github cli"],
    },
    {
      label: "GitHub CLI Authentication Status",
      keywords: ["authenticated", "not authenticated", "gh auth login"],
    },
    {
      label: "Tmux",
      keywords: ["terminal sessions", "tmux server"],
    },
    {
      label: "Tmux Installation Status",
      keywords: ["installed tmux", "not installed"],
    },
    {
      label: "Atmos Tmux Configuration",
      keywords: ["~/.atmos/atmos.sock", "terminal persistence", "session management"],
    },
  ],
  ai: [
    {
      label: "Providers",
      keywords: ["api keys", "endpoints", "default models", "background tasks", "add provider"],
    },
    {
      label: "Provider Test",
      keywords: ["test provider", "retest", "streaming response"],
    },
    {
      label: "Provider enabled",
      keywords: ["enable provider", "disable provider"],
    },
    {
      label: "Routing",
      keywords: ["choose provider", "tasks", "feature select"],
    },
    {
      label: "Git commit generator",
      keywords: ["commit message", "language", "prompt default"],
    },
    {
      label: "Workspace issue TODO extraction",
      keywords: ["todo extraction", "workspace issue", "language"],
    },
    {
      label: "Local Model",
      keywords: ["on-device", "no api key", "managed local model", "runtime"],
    },
  ],
  notify: [
    {
      label: "Notification Channels",
      keywords: ["agents need attention", "notification channel"],
    },
    {
      label: "Browser notifications",
      keywords: ["native browser notifications", "agents need attention", "test browser"],
    },
    {
      label: "Desktop notifications",
      keywords: ["system-level notifications", "desktop app", "test desktop"],
    },
    {
      label: "In-app toast",
      keywords: ["top-right app toasts", "agents need attention", "finish"],
    },
    {
      label: "Event Triggers",
      keywords: ["agent events", "trigger notifications"],
    },
    {
      label: "Agent permission requested",
      keywords: ["approval", "waiting for approval"],
    },
    {
      label: "Agent task complete",
      keywords: ["agent finishes", "running idle"],
    },
    {
      label: "Automation run outcomes",
      keywords: ["automation completes", "fails", "cancelled", "interrupted"],
    },
    {
      label: "Push Servers",
      keywords: ["self-hosted push", "ntfy", "bark", "gotify", "custom webhooks"],
    },
    {
      label: "Push automation outcomes",
      keywords: ["forward automation outcome notifications", "push servers"],
    },
    {
      label: "Push server URL",
      keywords: ["https", "webhook url", "ntfy url", "gotify url"],
    },
    {
      label: "Push server token",
      keywords: ["auth token", "optional auth token"],
    },
    {
      label: "Push server topic",
      keywords: ["ntfy topic"],
    },
    {
      label: "Push server device key",
      keywords: ["bark device key"],
    },
  ],
  "tunnel-connector": [
    {
      label: "Tunnel Connector providers",
      keywords: ["remote browser access", "local atmos instance"],
    },
    {
      label: "Cloudflare tunnel",
      keywords: ["cloudflare", "install", "authenticate", "start tunnel"],
    },
    {
      label: "ngrok tunnel",
      keywords: ["ngrok", "auth token", "configure token", "start tunnel"],
    },
    {
      label: "Tunnel auth token",
      keywords: ["paste auth token", "configure token"],
    },
    {
      label: "Start Tunnel",
      keywords: ["start tunnel", "remote browser"],
    },
    {
      label: "Stop Tunnel",
      keywords: ["stop tunnel", "remote browser"],
    },
    {
      label: "View Tunnel",
      keywords: ["view tunnel", "renew tunnel", "reuse token"],
    },
  ],
  "atmos-computer": [
    {
      label: "Access Key",
      keywords: ["access token", "register new computers", "registration codes", "identity"],
    },
    {
      label: "Generate Access Key",
      keywords: ["create access key", "generate token"],
    },
    {
      label: "Save Access Key",
      keywords: ["paste access key", "switch identity", "hosted web"],
    },
    {
      label: "Rotate Access Token",
      keywords: ["security refresh", "relay access token exposed"],
    },
    {
      label: "Private Relay",
      keywords: ["self-hosted relay", "official atmos relay"],
    },
    {
      label: "Relay URL",
      keywords: ["https://relay.atmos.land", "private relay url"],
    },
    {
      label: "Private Relay token",
      keywords: ["relay authentication", "secret key", "x-atmos-relay-secret"],
    },
    {
      label: "Register Computer",
      keywords: ["remote computer", "network", "cloud", "registration code"],
    },
    {
      label: "Register & Start One Computer",
      keywords: ["remote computer setup command", "register token"],
    },
    {
      label: "This Computer",
      keywords: ["register this computer", "online", "offline", "relay reconnect"],
    },
    {
      label: "My Computers",
      keywords: ["computers linked", "refresh", "remove computer", "connect"],
    },
  ],
  shortcuts: [
    {
      label: "Global shortcuts",
      keywords: ["toggle left sidebar", "toggle right sidebar", "command palette", "global search", "quick open file"],
    },
    {
      label: "Workspace shortcuts",
      keywords: ["new workspace overlay", "canvas overlay", "kanban overlay", "open create workspace"],
    },
    {
      label: "Center Stage Tabs shortcuts",
      keywords: ["overview tab", "fixed terminal tab", "terminal tab"],
    },
    {
      label: "Terminal shortcuts",
      keywords: ["split terminal", "new terminal tab", "close terminal pane", "find in terminal"],
    },
    {
      label: "Appshots shortcuts",
      keywords: ["capture focused app", "appshot"],
    },
    {
      label: "Editor shortcuts",
      keywords: ["save current file", "find in editor"],
    },
    {
      label: "Submit & Commit shortcuts",
      keywords: ["submit prompt", "commit message"],
    },
    {
      label: "Diff Viewer shortcuts",
      keywords: ["multi-select lines", "annotation"],
    },
  ],
  experiments: [
    {
      label: "Terminals (Management Center)",
      keywords: ["monitor terminal usage", "manage terminal usage"],
    },
    {
      label: "ACP Agents (Management Center and footer ACP Chat)",
      keywords: ["acp chat panel", "gui agent conversations", "footer"],
    },
    {
      label: "Automations (Management Center)",
      keywords: ["automation creation", "scheduled runs", "github-triggered automation"],
    },
    {
      label: "Project Wiki (Center Tabs)",
      keywords: ["project documentation", "knowledge base", "center stage tab"],
    },
  ],
  about: [
    {
      label: "Runtime",
      keywords: ["web", "desktop", "runtime"],
    },
    {
      label: "Version",
      keywords: ["app version", "desktop version"],
    },
    {
      label: "Atmos CLI",
      keywords: ["cli version", "install cli", "check cli version"],
    },
    {
      label: "Check for updates",
      keywords: ["desktop updates", "check update"],
    },
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
  })),
  ...SETTINGS_SEARCH_ITEMS.map((item) => ({
    ...item,
    kind: "item" as const,
  })),
];
