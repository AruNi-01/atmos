export interface ChangelogItem {
  id: string;
  title: {
    zh: string;
    en: string;
  };
  description: {
    zh: string;
    en: string;
  };
  date: string;
  version?: string;
  releaseUrl?: string;
  tags?: {
    zh: string;
    en: string;
  }[];
  image?: string;
  content: {
    zh: {
      features?: string[];
      improvements?: string[];
      fixes?: string[];
      others?: string[];
    };
    en: {
      features?: string[];
      improvements?: string[];
      fixes?: string[];
      others?: string[];
    };
  };
}

export const changelogData: ChangelogItem[] = [
  {
    id: "desktop-v0.2.6",
    title: {
      zh: "Landing 页面打磨与预览检查器",
      en: "Landing Polish & Preview Inspector",
    },
    description: {
      zh: "发布 `desktop-v0.2.6`，主要带来 landing 页面细节打磨，以及新的跨域预览元素检查能力。",
      en: "Release `desktop-v0.2.6` focuses on landing page polish plus a new cross-origin preview element inspector.",
    },
    date: "2026-03-26",
    version: "0.2.6",
    releaseUrl: "https://github.com/AruNi-01/atmos/releases/tag/desktop-v0.2.6",
    tags: [
      { zh: "Landing", en: "Landing" },
      { zh: "预览", en: "Preview" },
    ],
    content: {
      zh: {
        features: [
          "优化 landing 页面组件，并新增 latest changes 区块。[#58](https://github.com/AruNi-01/atmos/pull/58)",
          "新增跨域预览元素检查器。[#59](https://github.com/AruNi-01/atmos/pull/59)",
        ],
        others: [
          "[完整变更对比](https://github.com/AruNi-01/atmos/compare/desktop-v0.2.5...desktop-v0.2.6)",
        ],
      },
      en: {
        features: [
          "Refined landing page components and added a latest changes section. [#58](https://github.com/AruNi-01/atmos/pull/58)",
          "Added a cross-origin preview element inspector. [#59](https://github.com/AruNi-01/atmos/pull/59)",
        ],
        others: [
          "[Full changelog comparison](https://github.com/AruNi-01/atmos/compare/desktop-v0.2.5...desktop-v0.2.6)",
        ],
      },
    },
  },
  {
    id: "desktop-v0.2.5",
    title: {
      zh: "更顺滑的工作区删除体验",
      en: "Smoother Workspace Deletion",
    },
    description: {
      zh: "发布 `desktop-v0.2.5`，把工作区删除改成非阻塞流程，并加入进度 toast。",
      en: "Release `desktop-v0.2.5` makes workspace deletion non-blocking and adds progress toasts.",
    },
    date: "2026-03-22",
    version: "0.2.5",
    releaseUrl: "https://github.com/AruNi-01/atmos/releases/tag/desktop-v0.2.5",
    tags: [
      { zh: "工作区", en: "Workspace" },
      { zh: "反馈", en: "Feedback" },
    ],
    content: {
      zh: {
        fixes: [
          "工作区删除现在采用非阻塞流程，并在过程中显示进度 toast。[#57](https://github.com/AruNi-01/atmos/pull/57)",
        ],
        others: [
          "[完整变更对比](https://github.com/AruNi-01/atmos/compare/desktop-v0.2.4...desktop-v0.2.5)",
        ],
      },
      en: {
        fixes: [
          "Workspace deletion is now non-blocking and shows progress toasts while it runs. [#57](https://github.com/AruNi-01/atmos/pull/57)",
        ],
        others: [
          "[Full changelog comparison](https://github.com/AruNi-01/atmos/compare/desktop-v0.2.4...desktop-v0.2.5)",
        ],
      },
    },
  },
  {
    id: "desktop-v0.2.4",
    title: {
      zh: "预览体验与桌面工作区行为优化",
      en: "Preview UX & Workspace Behavior",
    },
    description: {
      zh: "发布 `desktop-v0.2.4`，重点改善预览交互体验，以及桌面端工作区相关行为。",
      en: "Release `desktop-v0.2.4` improves preview UX and desktop workspace behavior.",
    },
    date: "2026-03-21",
    version: "0.2.4",
    releaseUrl: "https://github.com/AruNi-01/atmos/releases/tag/desktop-v0.2.4",
    tags: [
      { zh: "预览", en: "Preview" },
      { zh: "桌面端", en: "Desktop" },
    ],
    content: {
      zh: {
        improvements: [
          "改善预览体验，并优化桌面端工作区行为。[#56](https://github.com/AruNi-01/atmos/pull/56)",
        ],
        others: [
          "[完整变更对比](https://github.com/AruNi-01/atmos/compare/desktop-v0.2.3...desktop-v0.2.4)",
        ],
      },
      en: {
        improvements: [
          "Improved preview UX and desktop workspace behavior. [#56](https://github.com/AruNi-01/atmos/pull/56)",
        ],
        others: [
          "[Full changelog comparison](https://github.com/AruNi-01/atmos/compare/desktop-v0.2.3...desktop-v0.2.4)",
        ],
      },
    },
  },
  {
    id: "desktop-v0.2.3",
    title: {
      zh: "终端链接与更新体验升级",
      en: "Terminal Links & Update Flow",
    },
    description: {
      zh: "发布 `desktop-v0.2.3`，新增终端链接打开偏好、编辑器跳转和文件树高亮，同时继续打磨更新检查与终端链接体验。",
      en: "Release `desktop-v0.2.3` adds terminal link preferences, editor jump-to-line, file-tree reveal, and continued polish for update checks and link handling.",
    },
    date: "2026-03-20",
    version: "0.2.3",
    releaseUrl: "https://github.com/AruNi-01/atmos/releases/tag/desktop-v0.2.3",
    tags: [
      { zh: "终端", en: "Terminal" },
      { zh: "更新", en: "Updates" },
    ],
    content: {
      zh: {
        features: [
          "新增终端链接打开偏好，可选择使用 Atmos、Finder 或特定应用打开，并支持 quick-open 应用选项。",
          "编辑器支持跳转到指定行和列。",
          "文件树支持自动定位并短暂高亮目标文件。",
        ],
        improvements: [
          "更新检查改用 toast 展示发布说明、安装进度和重启提示。",
          "改进终端链接识别与项目相对路径解析。",
          "细化 macOS 窗口红绿灯按钮的位置。",
        ],
        fixes: [
          "修复桌面端发布与更新流程，并改进终端链接处理。[#55](https://github.com/AruNi-01/atmos/pull/55)",
        ],
        others: [
          "[完整变更对比](https://github.com/AruNi-01/atmos/compare/desktop-v0.2.2...desktop-v0.2.3)",
        ],
      },
      en: {
        features: [
          "Terminal link opening preferences now let you choose Atmos, Finder, or a specific app, with quick-open app options.",
          "Jump to a specific line and column in the editor.",
          "Auto-reveal and transient highlight of files in the file tree.",
        ],
        improvements: [
          "Update checks now use toasts that show release notes, install progress, and restart messaging.",
          "Improved terminal link detection and project-relative path resolution.",
          "Refined macOS window traffic-light positioning.",
        ],
        fixes: [
          "Fixed the desktop release/update flow and improved terminal link handling. [#55](https://github.com/AruNi-01/atmos/pull/55)",
        ],
        others: [
          "[Full changelog comparison](https://github.com/AruNi-01/atmos/compare/desktop-v0.2.2...desktop-v0.2.3)",
        ],
      },
    },
  },
  {
    id: "desktop-v0.2.2",
    title: {
      zh: "终端搜索与设置面板刷新",
      en: "Terminal Search & Settings Refresh",
    },
    description: {
      zh: "发布 `desktop-v0.2.2`，围绕终端搜索、图片支持、设置面板和启动体验做了一轮集中更新。",
      en: "Release `desktop-v0.2.2` bundles terminal search, image support, settings refresh, and splashscreen polish.",
    },
    date: "2026-03-19",
    version: "0.2.2",
    releaseUrl: "https://github.com/AruNi-01/atmos/releases/tag/desktop-v0.2.2",
    tags: [
      { zh: "终端", en: "Terminal" },
      { zh: "设置", en: "Settings" },
    ],
    content: {
      zh: {
        features: [
          "新增终端内搜索界面，以及 web terminal 的图片 addon 支持。[#49](https://github.com/AruNi-01/atmos/pull/49)",
        ],
        improvements: [
          "升级 Next.js 依赖，并刷新设置面板体验。[#48](https://github.com/AruNi-01/atmos/pull/48)",
        ],
        fixes: [
          "修复 ACP 聊天折叠行为，并统一桌面端 splashscreen 主题表现。[#50](https://github.com/AruNi-01/atmos/pull/50)",
        ],
        others: [
          "[完整变更对比](https://github.com/AruNi-01/atmos/compare/desktop-v0.2.1...desktop-v0.2.2)",
        ],
      },
      en: {
        features: [
          "Added in-terminal search UI and image addon support for web terminals. [#49](https://github.com/AruNi-01/atmos/pull/49)",
        ],
        improvements: [
          "Upgraded Next.js dependencies and refreshed the settings modal. [#48](https://github.com/AruNi-01/atmos/pull/48)",
        ],
        fixes: [
          "Fixed ACP chat collapse behavior and aligned desktop splashscreen theming. [#50](https://github.com/AruNi-01/atmos/pull/50)",
        ],
        others: [
          "[Full changelog comparison](https://github.com/AruNi-01/atmos/compare/desktop-v0.2.1...desktop-v0.2.2)",
        ],
      },
    },
  },
  {
    id: "desktop-v0.2.1",
    title: {
      zh: "自动更新正式上线",
      en: "Automatic Updates Arrive",
    },
    description: {
      zh: "发布 `desktop-v0.2.1`，带来应用内更新、设置面板和 Homebrew tap，同时补齐桌面端发布基础设施。",
      en: "Release `desktop-v0.2.1` introduces in-app updates, a settings modal, Homebrew distribution, and the supporting release infrastructure.",
    },
    date: "2026-03-18",
    version: "0.2.1",
    releaseUrl: "https://github.com/AruNi-01/atmos/releases/tag/desktop-v0.2.1",
    tags: [
      { zh: "更新", en: "Updates" },
      { zh: "发布", en: "Release" },
    ],
    content: {
      zh: {
        features: [
          "新增应用内更新器，Atmos Desktop 会自动检查新版本，并在设置面板中显示更新通知。",
          "新增设置面板，用于管理应用偏好和更新配置。",
          "新增 Homebrew tap 支持，macOS 用户可通过 `brew` 安装和升级。",
        ],
        fixes: [
          "修复 `streamdown` 升级到 2.5.0 后，`@streamdown/code` 的 `HighlightOptions.themes` 类型不兼容问题。",
          "修复 reasoning 组件里 `CollapsibleContent` 向 `<Streamdown>` 透传无效 props 导致的 `dir` 类型构建错误。",
        ],
        others: [
          "新增桌面端发布 CI 工作流，支持 macOS arm64/x86_64、Linux 和 Windows 多平台构建。",
          "新增 Homebrew tap 自动同步工作流，在每次桌面端发布后自动触发。",
          "改进构建脚本和桌面端 capability 配置。",
          "[完整变更对比](https://github.com/AruNi-01/atmos/compare/desktop-v0.2.0...desktop-v0.2.1)",
        ],
      },
      en: {
        features: [
          "Added an in-app updater so Atmos Desktop checks for new versions automatically and shows an update notification in the Settings modal.",
          "Added a new settings modal for managing app preferences and update configuration.",
          "Added Homebrew tap support so macOS users can install and upgrade via `brew`.",
        ],
        fixes: [
          "Fixed the `HighlightOptions.themes` type mismatch in `@streamdown/code` after upgrading `streamdown` to 2.5.0.",
          "Fixed invalid props spread from `CollapsibleContent` into `<Streamdown>` in the reasoning component, which caused a build-time `dir` type error.",
        ],
        others: [
          "Added desktop release CI with multi-platform builds for macOS arm64/x86_64, Linux, and Windows.",
          "Added a Homebrew tap auto-sync workflow triggered on each desktop release.",
          "Improved build scripts and desktop capability configuration.",
          "[Full changelog comparison](https://github.com/AruNi-01/atmos/compare/desktop-v0.2.0...desktop-v0.2.1)",
        ],
      },
    },
  },
  {
    id: "desktop-v0.2.0",
    title: {
      zh: "桌面终端体验大升级",
      en: "Desktop Terminal Overhaul",
    },
    description: {
      zh: "发布 `desktop-v0.2.0`，重点升级桌面终端滚动与性能体验，同时加入 AI token 成本估算和 Cursor 会话同步。",
      en: "Release `desktop-v0.2.0` overhauls desktop terminal behavior and adds AI token cost estimates plus Cursor usage sync.",
    },
    date: "2026-03-18",
    version: "0.2.0",
    releaseUrl: "https://github.com/AruNi-01/atmos/releases/tag/desktop-v0.2.0",
    tags: [
      { zh: "终端", en: "Terminal" },
      { zh: "AI", en: "AI" },
    ],
    content: {
      zh: {
        features: [
          "在编辑器中新增内联 token 成本估算。",
          "新增 Cursor 会话的增量 token 使用量同步。",
        ],
        improvements: [
          "终端改用 xterm.js 原生滚动回溯，替代 tmux copy-mode，滚动更顺畅且带可见滚动条。",
          "消除终端窗口 resize 时的闪烁和内容重复。",
          "通过 `requestAnimationFrame` 批量输出，提升高频输出场景下的流畅度。",
          "终端 scrollback 历史可跨页面刷新保留。",
          "为 Claude API provider 新增 OAuth token 刷新与重试逻辑。",
        ],
        fixes: [
          "修复终端 resize 闪烁与 scrollback 问题。",
          "修复 Claude provider 的 OAuth token 刷新问题。",
        ],
        others: [
          "完整变更包括：`feat(terminal): support persistent terminal layout`、`fix(terminal): resize flicker and scrollback issues`、`fix(ai-usage): OAuth token refresh for Claude provider`、`feat(ai): inline cost estimates in editor`、`feat(cursor): incremental token usage sync`。",
        ],
      },
      en: {
        features: [
          "Added inline token cost estimates in the editor.",
          "Added incremental token usage sync for Cursor sessions.",
        ],
        improvements: [
          "Replaced tmux copy-mode with xterm.js native scrollback for smoother terminal scrolling with a visible scrollbar.",
          "Eliminated flicker and content duplication when resizing the terminal window.",
          "Added output batching via `requestAnimationFrame` for smoother high-frequency output.",
          "Terminal scrollback is now preserved across page refreshes.",
          "Added OAuth token refresh and retry logic for the Claude API provider.",
        ],
        fixes: [
          "Fixed terminal resize flicker and scrollback issues.",
          "Fixed OAuth token refresh behavior for the Claude provider.",
        ],
        others: [
          "Full change list: `feat(terminal): support persistent terminal layout`, `fix(terminal): resize flicker and scrollback issues`, `fix(ai-usage): OAuth token refresh for Claude provider`, `feat(ai): inline cost estimates in editor`, `feat(cursor): incremental token usage sync`.",
        ],
      },
    },
  },
  {
    id: "desktop-v0.1.5",
    title: {
      zh: "GitHub Issue 关联工作流上线",
      en: "GitHub Issue Workflow Lands",
    },
    description: {
      zh: "预发布 `desktop-v0.1.5`，把 GitHub Issue 关联、LLM 生成 TODO 和更稳的工作区创建流程一起带进了桌面端。",
      en: "Pre-release `desktop-v0.1.5` brings GitHub Issue linking, LLM-generated TODOs, and a more resilient workspace creation flow to the desktop app.",
    },
    date: "2026-03-15",
    version: "0.1.5",
    releaseUrl: "https://github.com/AruNi-01/atmos/releases/tag/desktop-v0.1.5",
    tags: [
      { zh: "GitHub", en: "GitHub" },
      { zh: "工作区", en: "Workspace" },
    ],
    content: {
      zh: {
        features: [
          "工作区现在可以关联 GitHub Issue，保存 issue 元数据，并在 Overview 中展示，同时支持通过 WebSocket 列表与读取 issue。",
          "全新 Create Workspace 流程：可选择 issue、设置显示名称、用 LLM 自动提取 TODO 并确认，还会重新生成 branch suffix。",
          "工作区创建上下文支持跨重连和重试恢复。",
          "LLM 配置新增按功能设置输出语言，可分别控制 git commit 与工作区 issue TODO 的语言。",
          "大量 UI 细节打磨：更顺滑的 project menu hover、更长名称 tooltip、provider usage 顺序拖拽持久化、setup 阶段隐藏旧路径和 wiki、关闭对话框时重置 branch suffix 等。",
        ],
        improvements: [
          "后端更新包含更安全的 worktree 管理、基于 `reqwest` 的 GitHub issue helper，以及新的 WebSocket-only 工作区创建事件流。",
          "TODO markdown 规范化逻辑只再切分编号列表，减少误拆。",
        ],
        others: [
          "迁移说明：需要运行数据库迁移以新增工作区 `display_name`、GitHub issue 字段以及 `auto_extract_todos`。",
          "可选配置：在 LLM providers 文件中设置 `features.git_commit_language` 与 `features.workspace_issue_todo_language`。",
          "使用 GitHub issue 列表与读取前，请确保已经配置 GitHub token。",
          "变更对应 PR：[feat(workspace): integrate github issue flow fixes #43](https://github.com/AruNi-01/atmos/pull/43)",
        ],
      },
      en: {
        features: [
          "Workspaces can now link to GitHub Issues, store issue metadata, show it on the Overview screen, and list/get issues over WebSocket.",
          "The Create Workspace flow was revamped to let you pick an issue, set a display name, auto-extract TODOs via LLM with confirmation, and regenerate the branch suffix.",
          "Workspace setup context now persists across reconnects and retries.",
          "LLM config now supports per-feature output language for git commits and workspace issue TODOs.",
          "UI polish includes smoother project menu hover, tooltips for long names, persistent provider usage drag-reorder, hiding stale paths and wiki during setup, and resetting branch suffix when the dialog closes.",
        ],
        improvements: [
          "Backend updates include safer worktree management, GitHub issue helpers using `reqwest`, and a WebSocket-only workspace creation flow.",
          "TODO markdown normalization now only splits numbered lists.",
        ],
        others: [
          "Migration: run DB migrations to add workspace `display_name`, GitHub issue fields, and `auto_extract_todos`.",
          "Optional config: set `features.git_commit_language` and `features.workspace_issue_todo_language` in your LLM providers file.",
          "Ensure a GitHub token is configured before using issue list/get.",
          "Change PR: [feat(workspace): integrate github issue flow fixes #43](https://github.com/AruNi-01/atmos/pull/43)",
        ],
      },
    },
  },
  {
    id: "desktop-v0.1.4",
    title: {
      zh: "首个桌面版发布",
      en: "First Desktop App Release",
    },
    description: {
      zh: "这是 `desktop-v0.1.4` 的首个桌面版发布，当时仅提供 macOS ARM 构建。",
      en: "This was the first desktop app release under `desktop-v0.1.4`, initially shipping only a macOS ARM build.",
    },
    date: "2026-03-13",
    version: "0.1.4",
    releaseUrl: "https://github.com/AruNi-01/atmos/releases/tag/desktop-v0.1.4",
    tags: [
      { zh: "桌面端", en: "Desktop" },
      { zh: "首发", en: "Launch" },
    ],
    content: {
      zh: {
        features: ["首个桌面版正式发布，仅包含 macOS ARM 构建。"],
      },
      en: {
        features: ["First desktop app release, shipping only a macOS ARM build."],
      },
    },
  },
];
