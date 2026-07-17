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
    id: "desktop-2026.7.16",
    title: {
      zh: "Grok Build 终端 Agent · TanStack Query · GitHub 中心标签页",
      en: "Grok Build Terminal Agent, TanStack Query & GitHub Center Tabs",
    },
    description: {
      zh: "Atmos Desktop 2026.7.16 将 2026.7.15 beta 线打磨为稳定版，并新增一等公民的 Grok Build 终端支持；同时引入 TanStack Query 数据层、GitHub 中心标签页、工作区分组，以及 TypeScript 7 工具链与大量终端/编辑器可靠性修复。",
      en: "Atmos Desktop 2026.7.16 graduates the 2026.7.15 beta line into a stable release and adds first-class Grok Build terminal support. It ships the TanStack Query data layer, GitHub center tabs, workspace grouping, TypeScript 7 tooling, and a wave of terminal and editor reliability fixes.",
    },
    date: "2026-07-16",
    version: "2026.7.16",
    releaseUrl: "https://github.com/AruNi-01/atmos/releases/tag/desktop-2026.7.16",
    tags: [
      { zh: "Grok Build", en: "Grok Build" },
      { zh: "数据层", en: "Data Layer" },
      { zh: "GitHub", en: "GitHub" },
      { zh: "工作区分组", en: "Workspace Grouping" },
    ],
    content: {
      zh: {
        features: [
          "**Grok Build 终端 Agent** — 一等公民支持 Grok Build CLI（`grok`）作为内置终端 Agent，覆盖 Agent 选择、运行配置、自动化、streaming-json 解析（文本 + thinking）以及主题配套图标。",
          "**Grok Build 用量与 Hooks** — Grok Build / SuperGrok 订阅额度显示在 AI 用量中；状态类 Grok hooks 安装到 `~/.grok/hooks/`（尊重 opt-out），在检测到 `grok` 时于 API 启动自动安装；CLI 身份探测可正确解析冲突的 `agent` 标题。",
          "**TanStack Query 数据层** — 核心应用数据获取从 Zustand store 迁移到 TanStack Query，缓存与刷新语义更可预期。覆盖项目与工作区、文件系统、Git 快照、Agent 注册表与自定义 Agent、本地服务、Review 会话、GitHub PR 缓存，以及 CI 运行列表 / 文件 diff 视图。",
          "**GitHub 中心标签页** — PR 详情、CI 检查与文件 diff 改为在中心标签页打开（不再用模态框），并改进标签持久化与交互体验。",
          "**工作区分组** — 侧边栏可按标签与优先级对工作区分组，跨项目作用域行为一致，设置中提供优先级/标签分组的双列开关。",
        ],
        fixes: [
          "**语法高亮缓存** — 修复 FileContents 与 CodeViewItem 之间的缓存 key 冲突，避免渲染出过期的高亮结果。",
          "**工作区分组拖拽** — 修复拖拽过程中分组意外折叠的问题，并加固分组设置在边界场景下的行为。",
          "**多行 Agent 命令启动** — 长命令以单次 bracketed-paste 写入终端；多行 shell 参数使用 ANSI-C 引号，避免截断或误执行。",
          "**Agent Fix 与文件树** — 长 prompt 改为写入工作区文件而非内联嵌入；加固文件树路径回退逻辑。",
          "**刷新图标方向** — 修复 Atmos Computer / 远程访问面板刷新图标旋转方向错误。",
          "**侧边栏设置启动重试** — 加固侧边栏设置 bootstrap 重试逻辑，可在应用启动时的瞬时失败后恢复。",
          "**编辑器 Minimap** — 修复 minimap 随文档滚动而移动的问题，保持固定位置。",
          "**终端焦点** — 隐藏 AI 输入后焦点正确回到终端。",
          "**用量面板页脚** — 修复全局搜索中嵌入式用量面板页脚与可滚动内容重叠。",
          "**Grok 终端身份** — 加固 Grok 相关终端标题匹配（管道符、Windows 路径、平台打包的 `grok-*` 二进制），并在 Grok 会话中禁用不兼容的外部 hooks。",
          "**发布与 Landing 构建** — 修复桌面发布后 R2 同步的 CI 触发；修复 Landing 在 Bun 1.3 / 1.4 lockfile 下的 Vercel 构建，以及 Next.js 内联脚本 hydration 警告。",
        ],
        improvements: [
          "**TypeScript 7 工具链** — 采用双包工具链：原生 `tsc`（TS 7）负责 typecheck，TypeScript 6 继续服务 ESLint。",
          "**WebSocket 优先收敛** — 将重复的 REST 端点收敛为 WebSocket actions，缩小传输面并与 WebSocket-first 规则对齐。",
          "**终端搜索与字体** — 字体缩放时保留终端滚动位置；关闭搜索浮层时隐藏搜索匹配选区。",
          "**Cursor 启动命令** — 内置 Cursor 启动改用 `cursor-agent` 而非裸 `agent` 命令，在同时安装 Grok 时身份更清晰。",
          "**Agent Hooks 状态卡** — 不再展示嘈杂的版本号；Grok 及其他 Agent 的 hooks 安装与标注更清晰。",
        ],
        others: [
          "将 GitHub 详情模态相关文件重构并入中心标签页模块。",
          "补充编辑器工具依赖，为后续编辑器增强做准备。",
        ],
      },
      en: {
        features: [
          "**Grok Build terminal agent** — First-class support for the Grok Build CLI (`grok`) as a built-in terminal agent, including agent select, run configuration, automations, streaming-json parsing (text + thinking), and theme-paired icons.",
          "**Grok Build usage & hooks** — Grok Build / SuperGrok subscription credits appear in AI usage. Status-only Grok hooks install under `~/.grok/hooks/` (opt-out respected), auto-install on API startup when `grok` is detected, and a CLI identity probe correctly resolves contested `agent` titles.",
          "**TanStack Query data layer** — Core application data fetching migrated from Zustand stores to TanStack Query for more predictable caching, refresh semantics, and consistency. Covers project and workspace data, filesystem operations, Git snapshots, agent registry and custom agents, local services, review sessions, GitHub PR cache, and CI run list / file diff views, with query options, hooks, and an event bridge across extended domains.",
          "**GitHub center tabs** — Pull request details, CI checks, and file diffs open in center tabs instead of modal dialogs, with improved tab persistence and UX.",
          "**Workspace grouping** — Workspaces group by label and priority in the sidebar, with consistent behavior across project scopes and two-column settings toggles for priority and label grouping.",
        ],
        fixes: [
          "**Syntax highlighting cache** — Fixed cache key collisions across FileContents and CodeViewItem that caused stale rendered output.",
          "**Workspace grouping drag** — Fixed workspace groups collapsing unexpectedly during drag operations and hardened grouping settings against edge cases.",
          "**Multiline agent launches** — Long commands are delivered as a single bracketed-paste write; multiline shell arguments use ANSI-C quoting.",
          "**Agent-fix & file tree** — Long prompts are stored to a workspace file instead of embedded inline; hardened file-tree path fallbacks.",
          "**Refresh icon direction** — Fixed refresh icon spin direction on Atmos Computer and remote access panels.",
          "**Sidebar settings bootstrap** — Fixed sidebar settings bootstrap retry logic to survive transient failures during app startup.",
          "**Editor minimap** — Fixed the editor minimap so it stays fixed while the document scrolls.",
          "**Terminal focus** — Fixed terminal focus returning to the terminal when AI input is hidden.",
          "**Usage panel footer** — Fixed the usage panel embedded footer overlapping scrollable content in global search.",
          "**Grok terminal identity** — Hardened Grok-related terminal title matching (pipes, Windows paths, platform-packaged `grok-*` binaries) and disabled incompatible foreign hooks for Grok sessions.",
          "**Release & landing builds** — Fixed CI workflow triggering for R2 sync after desktop releases; fixed landing page Vercel builds for Bun 1.3 and 1.4 lockfile formats, and resolved a Next.js inline script hydration warning.",
        ],
        improvements: [
          "**TypeScript 7 toolchain** — Adopted TypeScript 7 with a dual-package toolchain, keeping TypeScript 6 for ESLint while using native `tsc` for typechecking.",
          "**WebSocket-first consolidation** — Consolidated duplicate REST endpoints into WebSocket actions, reducing transport surface area.",
          "**Terminal search & font** — Preserve terminal scroll position on font resize and hide search match selections when the search overlay is dismissed.",
          "**Cursor launch command** — Cursor built-in launches now use `cursor-agent` instead of the bare `agent` command so identity stays unambiguous when Grok is also installed.",
          "**Agent hooks status card** — No longer surfaces noisy version numbers; hooks install and labeling are clearer for Grok and other agents.",
        ],
        others: [
          "Refactored GitHub detail modal files into the center-tab module.",
          "Added editor utility dependencies for upcoming editor enhancements.",
        ],
      },
    },
  },
  {
    id: "desktop-2026.7.9",
    title: {
      zh: "终端缓存控制 · 侧边栏与头部配置 · AI 选区上下文",
      en: "Terminal Cache Control, Layout Toggles & AI Selection Context",
    },

    description: {
      zh: "Atmos Desktop 2026.7.9 将 2026.7.6 阶段的终端体验与稳定性更新打磨为了稳定版，新增了强大的终端缓存策略、自定义终端标签名称、便捷的 AI 选区上下文交互，并全面提升了性能和应用内打磨。",
      en: "Atmos Desktop 2026.7.9 graduates the 2026.7.6 terminal UX and stability updates into a stable release, bringing robust terminal caching strategies, custom terminal tab names, instant AI selection context, and broad performance polish.",
    },
    date: "2026-07-09",
    version: "2026.7.9",
    releaseUrl: "https://github.com/AruNi-01/atmos/releases/tag/desktop-2026.7.9",
    tags: [
      { zh: "终端缓存", en: "Terminal Cache" },
      { zh: "UI 定制", en: "UI Customization" },
      { zh: "工作流", en: "Workflow" },
    ],
    content: {
      zh: {
        features: [
          "**终端缓存策略** — 引入全面的终端缓存机制，支持面板缓存限制、新增专属缓存配置界面，并通过最大终端数限制策略实现更优的资源管理。",
          "**自定义终端标签与面板名称** — 现在可以为终端标签页和面板命名，以便更好地区分工作流。修改名称时上下文菜单将保持非模态交互，带来更顺畅的编辑体验。",
          "**头部与侧边栏功能定制** — 为头部按钮和右侧边栏功能区新增了可见性开关，可以按需隐藏不需要的入口。",
          "**终端 AI 选区上下文** — 在终端中选中文本时，可通过选区弹出层快捷将其加入 AI 上下文。",
          "**终端选择工具栏增强** — 在终端选区悬浮栏新增带自动消失反馈的复制按钮；新增 `Cmd+Shift+G` 快捷键，用于将 AI 输入面板固定在终端。",
          "**Landing 演示视频** — Landing 首页头图已替换为全屏演示视频对话框，更直观展示 Agent 交互。",
          "**目录滚动导航** — Changelog 页面新增了基于滚动驱动的 `ScrollToc` 组件，优化了阅读较长日志时的导航体验。",
        ],
        fixes: [
          "**终端稳定性** — 解决了由缓存驱逐导致的状态错误、HMR 内存泄漏以及 React 协调 Bug，确保在发生缓存淘汰时已有的标签页能被正确保留。",
          "**Review 差异视图** — 修复了在代码差异视图中添加评论时页面发生异常滚动跳转的问题，Tab 标签悬停也会正确显示被截断的文件名。",
          "**终端交互细节** — 修复了将终端选区填入 AI 输入时由于光标位置错误导致芯片排序倒置的问题，以及 Prompt Composer 斜杠命令的解析失效问题。",
          "**Agent 启动流程** — 修复了 TUI Agent 的交互启动命令执行失效问题，以及重连时刷新按钮导致的状态冲突。",
        ],
        improvements: [
          "**并发 WebSocket 消息处理** — API 现已支持并发处理 WebSocket 消息，避免队头阻塞，大幅提升了操作密集型场景下的桌面端响应速度。",
          "**扫描器与引擎性能优化** — 采用并发执行和本地缓存来优化本地服务端口扫描器；为内核引擎中的 `git` 和 `gh` CLI 执行命令增加超时控制以确保资源不会被挂起命令锁死。",
          "**UI 与布局动效打磨** — 将终端发送命令时的扫光动效内嵌至输入框内；重构了 Toast 通知，通知栏操作更加清晰且带有弹出动画；优化了工作区进入时的浮层遮罩性能。",
          "**设置面板与国际化配置** — 改进了设置弹窗，增强了侧边栏和模块区块标题的多语言动态切换能力；全局日期格式化默认采用 UTC，避免由于时区读取失败产生的后备渲染错误。",
        ],
        others: [
          "内容安全策略 (CSP) 现已允许 `blob:` 资源加载。",
          "移除了过时的工作区 Notes 面板以保持工作区整洁；“Atmos Computer”概念重命名为“Remote Access / 远程访问”。",
        ],
      },
      en: {
        features: [
          "**Terminal Caching Strategy** — Implemented a comprehensive terminal caching strategy with panel-based limits, a dedicated settings UI, and max-terminal-count eviction for reliable resource management.",
          "**Custom Terminal Tab & Pane Naming** — You can now assign custom names to terminal tabs and panes. Tab context menus have been rebuilt as non-modal popovers to ensure smooth inline renaming.",
          "**Header & Sidebar Visibility Toggles** — Added per-feature visibility toggles for workspace header buttons and right sidebar tabs to clean up your layout.",
          "**Selection-based AI Context Chips** — When text is selected in the terminal, you can instantly turn it into an AI context chip from the selection toolbar.",
          "**Terminal Toolbar Enhancements** — Added a copy button to the terminal selection toolbar with transient auto-dismiss feedback, and a `Cmd+Shift+G` hotkey to pin the AI input overlay.",
          "**Landing Demo Video** — Replaced the landing page hero image with a full-screen video dialog showing a compressed agent terminal demo.",
          "**Scroll-driven TOC** — Added a scroll-driven `ScrollToc` component to improve table of contents navigation on the changelog page.",
        ],
        fixes: [
          "**Terminal Stability** — Resolved cache eviction bugs, HMR memory leaks, and React reconciliation issues so that previous context tabs are properly preserved during aggressive transitions.",
          "**Review Diff View** — Fixed page jump and scrolling bugs when adding comments in a review diff. Diff view tab tooltips now show full paths on hover.",
          "**Terminal Input Positioning** — Fixed terminal caret position and chip order when inserting selection AI context, and addressed prompt composer slash command parsing failures.",
          "**Agent Launch Flow** — Restored interactive agent launches with TUI follow-up and fixed empty launch states along with header refresh button conflicts.",
        ],
        improvements: [
          "**Concurrent WebSocket Handling** — The core API now handles incoming WebSocket messages concurrently, avoiding head-of-line blocking and speeding up desktop responsiveness during high-volume events.",
          "**Scanner & Engine Optimizations** — Sped up the local services scanner with concurrency and caching support, and added timeout limits for `git` and `gh` CLI executions so hung commands won't lock up backend workers.",
          "**UI & Layout Polish** — Moved the terminal AI send sweep animation inside the input frame, improved toast alerts with outward dismissal animations, and optimized the new workspace overlay entry transitions.",
          "**Settings & i18n Resilience** — Enhanced the Settings modal with dynamically translated sidebars and headers, and configured UTC as the default fallback timezone to prevent hydration mismatches.",
        ],
        others: [
          "Added support for `blob:` resources in the desktop Content Security Policy (CSP).",
          "Removed the obsolete workspace notes surface to clean up the interface, and renamed the 'Atmos Computer' concept to 'Remote Access / 远程访问' in navigation flows.",
        ],
      },
    },
  },
  {
    id: "desktop-2026.7.3",
    title: {
      zh: "终端侧聊 · Appshots 工作流 · 预览检查增强",
      en: "Terminal Side Chats, Appshots Workflow & Preview Inspection",
    },
    description: {
      zh: "Atmos Desktop 2026.7.3 将 beta 阶段的终端侧聊、更丰富的预览检查、更清晰的 Agent hook 上下文、Appshots 工作流打磨和桌面运行时可靠性更新整理为稳定版。",
      en: "Atmos Desktop 2026.7.3 graduates the beta line with terminal side chats, richer preview inspection, cleaner agent hook context, Appshots workflow polish, and desktop runtime reliability updates.",
    },
    date: "2026-07-03",
    version: "2026.7.3",
    releaseUrl: "https://github.com/AruNi-01/atmos/releases/tag/desktop-2026.7.3",
    tags: [
      { zh: "终端侧聊", en: "Side Chats" },
      { zh: "Appshots", en: "Appshots" },
      { zh: "预览", en: "Preview" },
      { zh: "Agent Hooks", en: "Agent Hooks" },
    ],
    content: {
      zh: {
        features: [
          "**Tmux 支持的终端侧聊** — 可从终端 AI Input 使用 `/side` 启动一个独立 Agent 对话，并带入受限的终端上下文，而不会把旁支任务发送回原终端。",
          "**侧聊持久化与恢复** — 隐藏的侧聊现在会保留恢复 handle，只要底层 tmux window 还存在，就能从来源终端表面恢复。",
          "**侧聊 Agent 选择器** — 当父终端还没有检测到 Agent 时，侧聊会显示明确的 Agent selector，并复用 welcome composer 的 Agent 选择和运行配置流程。",
          "**预览悬停标签** — Preview overlay/runtime 新增 follow-cursor hover labels，用更轻量的方式识别当前悬停的页面元素。",
          "**带终端上下文的 Agent Hooks** — 版本管理的 Agent hooks 现在能把终端上下文带入 hook 通知和状态导航，包括侧聊终端。",
          "**独立错误页面** — 新增应用级错误和 not-found 状态的专用 breakout pages。",
        ],
        fixes: [
          "**macOS Appshots 焦点回传** — 修复全局快捷键截图完成后主 Atmos 窗口没有重新前置的问题。",
          "**终端 AI Input 交互** — 修复 canvas 和侧聊 modal 中的 Cmd/Ctrl+G、hover-to-focus、`/` 与 `@` popover 键盘选择，以及侧聊 modal resize 行为。",
          "**终端快捷键与焦点** — 修复全局应用快捷键、quick-open surface 和终端网格焦点抢占常用终端输入流程的问题。",
          "**桌面运行时启动配置** — 修复 Desktop browser web runtime launch configuration，确保桌面 shell 刷新并使用预期运行时设置。",
          "**Agent 与运行时显示** — 修复 Cursor 内置 Agent launch 的 interactive yolo mode、Atmos Server 运行时命名、技能 Agent 图标映射和 workspace overview 文本约束。",
        ],
        improvements: [
          "**Appshots 捕获体验** — 捕获 popover 倒计时加入 hover-to-pause、animated badge expansion，并保持未暂停时的紧凑倒计时状态。",
          "**终端侧聊状态处理** — 改进 scoped record merges、scoped status updates、本地 modal 状态保留、split terminal side chat workflow 和 stale side chat registry cleanup。",
          "**侧聊动作与 WebSocket 流程** — 补齐更多 terminal side chat action wiring，并继续打磨终端 UX 和桌面 launcher integration。",
          "**应用交互打磨** — 改进 workspace header controls、workspace/sidebar cards、usage badges、review/chat surfaces 和 prompt composer Appshot paste coverage。",
          "**Atmos Computer 与预览传输** — 改进本地 Atmos Computer 切换、connection hydration、connected computer copy，以及 same-origin/extension-backed preview sessions 的 hover label 支持。",
          "**启动、发布与文档** — 稳定桌面启动和发布检查路径，并刷新当前 app、CLI、功能和 workflow 文档布局。",
        ],
        others: [
          "新增 terminal side chats 和 architecture review work 的 specs 与架构记录。",
          "更新内部 docs-writing/spec-visualization skills，并刷新 landing changelog 内容。",
          "移除 release line 中过时的 review CLI 引用。",
          "[完整变更对比](https://github.com/AruNi-01/atmos/compare/desktop-2026.7.2...desktop-2026.7.3)",
        ],
      },
      en: {
        features: [
          "**Tmux-backed terminal side chats** — Use `/side` from terminal AI Input to start a separate agent conversation seeded with bounded terminal context, without sending the tangent into the source terminal.",
          "**Side chat persistence and restore handles** — Hidden side chats can be restored from their source terminal surface while the underlying tmux window still exists.",
          "**Side chat Agent selector** — When the parent terminal has not detected an Agent, side chat now shows an explicit Agent selector and reuses the welcome composer Agent selector and run configuration flow.",
          "**Preview hover labels** — Follow-cursor preview hover labels across the preview overlay/runtime make hovered elements easier to identify with a lighter inspection flow.",
          "**Agent hooks with terminal context** — Version-managed agent hooks now carry terminal context into hook notifications and status navigation, including side chat terminals.",
          "**Dedicated breakout error pages** — Added dedicated breakout pages for app-level errors and not-found states.",
        ],
        fixes: [
          "**macOS Appshots focus handoff** — Restored the focus handoff after global shortcut captures so the main Atmos window is brought forward again when a capture completes.",
          "**Terminal AI Input interactions** — Fixed Cmd/Ctrl+G handling, hover-to-focus input behavior, `/` and `@` popover keyboard selection, and side chat modal resizing in canvas and side chat modal surfaces.",
          "**Terminal shortcuts and focus** — Fixed global app shortcuts, quick-open surfaces, and terminal grid focus stealing common terminal input flows.",
          "**Desktop runtime launch configuration** — Fixed Desktop browser web runtime launch configuration so the desktop shell refreshes and uses the expected runtime settings.",
          "**Agent and runtime display** — Fixed Cursor built-in Agent launches, Atmos Server runtime labeling, skill Agent icon mapping, and workspace overview text constraints.",
        ],
        improvements: [
          "**Appshots capture experience** — Smoothed the capture popover countdown with hover-to-pause behavior and animated badge expansion while keeping the compact countdown state tight when it is not paused.",
          "**Terminal side chat state handling** — Improved scoped record merges, scoped status updates, local modal state preservation, split terminal side chat workflow support, and stale side chat registry cleanup.",
          "**Side chat actions and WebSocket flow** — Finished more terminal side chat action wiring through the WebSocket flow and refined the surrounding terminal UX and desktop launcher integration.",
          "**App interaction polish** — Improved workspace header controls, workspace/sidebar cards, usage badges, review/chat surfaces, and prompt composer Appshot paste coverage.",
          "**Atmos Computer and preview transport** — Improved local Atmos Computer switching, connection hydration, connected computer copy, and hover label support for same-origin and extension-backed preview sessions.",
          "**Startup, release checks, and docs** — Stabilized desktop startup and release checks, then refreshed product docs and documentation layout for current app, CLI, feature, and workflow coverage.",
        ],
        others: [
          "Added specs and architecture notes for terminal side chats and architecture review work.",
          "Updated internal docs-writing/spec-visualization skills and refreshed landing changelog content.",
          "Removed an obsolete review CLI reference from the release line.",
          "[Full changelog comparison](https://github.com/AruNi-01/atmos/compare/desktop-2026.7.2...desktop-2026.7.3)",
        ],
      },
    },
  },
  {
    id: "desktop-2026.7.2",
    title: {
      zh: "Canvas 工作台 · 预览窗口 · Agent Chat 稳定性",
      en: "Canvas Workspaces, Preview Windows & Agent Chat Stability",
    },
    description: {
      zh: "Atmos Desktop 2026.7.2 汇总了上一条稳定版之后的桌面主线能力：Canvas 工作台、桌面预览与独立窗口、Agent Chat 历史、Git/GitHub 流程、本地运行时和发布基础设施都得到更新。",
      en: "Atmos Desktop 2026.7.2 rolls up the desktop-facing work since the previous stable release: Canvas workspaces, desktop preview and standalone windows, Agent Chat history, Git/GitHub workflows, local runtime distribution, and release infrastructure.",
    },
    date: "2026-07-02",
    version: "2026.7.2",
    releaseUrl: "https://github.com/AruNi-01/atmos/releases/tag/desktop-2026.7.2",
    tags: [
      { zh: "Canvas", en: "Canvas" },
      { zh: "预览", en: "Preview" },
      { zh: "Agent Chat", en: "Agent Chat" },
      { zh: "工作台", en: "Workbench" },
    ],
    content: {
      zh: {
        features: [
          "**桌面预览与独立窗口** — 新增桌面预览 DevTools、专用预览浏览器窗口、原生预览遮挡处理和独立浏览器标签页状态保留，让预览可以在嵌入视图和独立窗口之间切换。",
          "**Canvas 工作台** — 新增 Canvas workspace surfaces、Canvas widgets、Canvas 内共享 changes UI、更安全的 widget navigation 和更稳定的 widget placement。",
          "**Scoped Changes 与 Git diff** — 新增 scoped changes diff views、branch validation、remote branch qualification、renamed-path diff 处理和 stale commit scope cleanup。",
          "**Agent Chat 独立窗口与历史** — 增强 standalone Agent Chat handoff、全局 ACP chat history、chat history 中的 cwd 展示、紧凑历史 metadata 和 tool output rendering。",
          "**GitHub 与 relay 工作流** — 新增更顺滑的 Atmos Computer relay setup、多值 GitHub trigger filters、GitHub modal 交互改进和 automation limit hardening。",
          "**终端与技能入口** — 新增 terminal agent input shortcut，刷新 settings skills、terminal panels，并加入 text-to-Lottie skill 支持。",
          "**Landing 与验证资产** — 新增 landing i18n、刷新 feature showcase、加入 Atmos intro video，并补上分层 Playwright E2E、smoke suites 和验证 harness。",
        ],
        improvements: [
          "**运行时 locale** — 工作台 i18n 改为跟随 runtime locale，减少 Desktop、Web 和 local runtime 入口之间的不一致。",
          "**预览与 Canvas 性能** — 降低 Canvas browser viewport 延迟，并打磨 preview fullscreen 交互。",
          "**工作台体验** — 改进 canvas、automation、review、editor preview、repository workflow、app shell、connection 和 agent workflow surfaces。",
          "**搜索与设置** — 改进 global search matching、settings highlighting、workspace welcome、shared utilities 和 feature showcase layout。",
          "**本地运行时与 CLI 分发** — 本地运行时发布迁移到 `atmos-land` scope，移除旧的 local runtime npm installer path，并把 CLI update logic 收敛到 runtime-manager。",
          "**安装与更新可靠性** — 强化 CLI updater asset selection、checked release installation、manual-only desktop update GitHub links 和 R2/Homebrew 发布同步。",
          "**CI 与验证速度** — 优化 E2E setup runtime usage、setup mocks、cached web translators、changed-path web CI 和 web lint source scoping。",
        ],
        fixes: [
          "**预览稳定性** — 修复 desktop preview chrome、picker、fullscreen interactions、preview metadata sync、standalone preview windows，以及 overlay/loading 状态下的 native preview 遮挡问题。",
          "**右侧栏与文件操作** — 修复 right-sidebar file reveal 行为、file-tree context menu positioning 和 canvas overlay 下的相关问题。",
          "**GitHub setup 稳定性** — 修复 locale-free GitHub setup return URL、setup completion、installation-token parsing、stale installation selection、callback authorization fallback、trigger setup refresh 和 hosted access key display。",
          "**Git 与 changes scope** — 修复 shallow fetch targets、renamed-path diffs、stale commit scope data、missing scope cleanup 和 workspace branch validation。",
          "**Agent Chat 与 ACP** — 修复 agent chat review feedback、follow-up review feedback、session persistence、ACP chat panel history UX 和 terminal history metadata。",
          "**项目导入与启动** — 修复 empty imported projects visibility、mobile project import visibility 和 desktop startup error routing。",
          "**CLI 更新链路** — 修复 CLI updater asset selection、invalid CLI install result、checked CLI release install 和 runtime-manager CLI update parsing。",
          "**CI/E2E 回归** — 修复 Rust CI、Linux/diagnostics/token-usage clippy、infra migration test、Bun setup、web lint/typecheck、E2E startup/readiness、static export root、API prebuild/startup、missing client session 和 smoke assertions。",
        ],
        others: [
          "本条目覆盖上一条稳定版到 2026.7.2 之间的完整变更范围，共 134 个 non-merge commit。",
          "[完整变更对比](https://github.com/AruNi-01/atmos/compare/desktop-v2.0.0...desktop-2026.7.2)",
        ],
      },
      en: {
        features: [
          "**Desktop preview and standalone windows** — Added desktop preview DevTools, a dedicated preview browser window, native preview occlusion handling, and standalone browser tab state preservation.",
          "**Canvas workspaces** — Added Canvas workspace surfaces, Canvas widgets, shared changes UI inside Canvas, safer widget navigation, and more stable widget placement.",
          "**Scoped Changes and Git diffs** — Added scoped changes diff views, branch validation, remote branch qualification, renamed-path diff handling, and stale commit-scope cleanup.",
          "**Agent Chat windows and history** — Improved standalone Agent Chat handoff, global ACP chat history, cwd visibility in chat history, compact history metadata, and tool output rendering.",
          "**GitHub and relay workflows** — Added a smoother Atmos Computer relay setup, multi-value GitHub trigger filters, GitHub modal interaction improvements, and automation-limit hardening.",
          "**Terminal and skill entry points** — Added a terminal agent input shortcut, refreshed settings skills and terminal panels, and added text-to-Lottie skill support.",
          "**Landing and verification assets** — Added landing i18n, refreshed the feature showcase, added an Atmos intro video, and expanded layered Playwright E2E, smoke suites, and verification harnesses.",
        ],
        improvements: [
          "**Runtime locale** — The workbench i18n flow now follows runtime locale configuration, reducing mismatches across Desktop, Web, and local runtime entry points.",
          "**Preview and Canvas performance** — Reduced Canvas browser viewport lag and refined preview fullscreen interactions.",
          "**Workbench experience** — Improved canvas, automation, review, editor preview, repository workflow, app shell, connection, and agent workflow surfaces.",
          "**Search and settings** — Improved global search matching, settings highlighting, workspace welcome content, shared utilities, and feature showcase layout.",
          "**Local runtime and CLI distribution** — Moved local runtime publishing under the `atmos-land` scope, removed the older local runtime npm installer path, and moved CLI update logic into runtime-manager.",
          "**Install and update reliability** — Hardened CLI updater asset selection, checked release installation, manual-only desktop update GitHub links, and R2/Homebrew release sync.",
          "**CI and validation speed** — Optimized E2E setup runtime usage, setup mocks, cached web translators, changed-path web CI, and web lint source scoping.",
        ],
        fixes: [
          "**Preview stability** — Fixed desktop preview chrome, picker behavior, fullscreen interactions, preview metadata sync, standalone preview windows, and native preview occlusion while overlays or loading states are active.",
          "**Right sidebar and file actions** — Fixed right-sidebar file reveal behavior, file-tree context menu positioning, and related canvas overlay issues.",
          "**GitHub setup stability** — Fixed locale-free GitHub setup return URLs, setup completion, installation-token parsing, stale installation selection, callback authorization fallback, trigger setup refresh, and hosted access-key display.",
          "**Git and changes scope** — Fixed shallow fetch targets, renamed-path diffs, stale commit scope data, missing scope cleanup, and workspace branch validation.",
          "**Agent Chat and ACP** — Fixed agent chat review feedback, follow-up review feedback, session persistence, ACP chat panel history UX, and terminal history metadata.",
          "**Project import and startup** — Fixed empty imported project visibility, mobile project import visibility, and desktop startup error routing.",
          "**CLI update path** — Fixed CLI updater asset selection, invalid CLI install results, checked CLI release installation, and runtime-manager CLI update parsing.",
          "**CI/E2E regressions** — Fixed Rust CI, Linux/diagnostics/token-usage clippy, infra migration tests, Bun setup, web lint/typecheck, E2E startup/readiness, static export roots, API prebuild/startup, missing client sessions, and smoke assertions.",
        ],
        others: [
          "This entry covers the full change range from the previous stable release to 2026.7.2, spanning 134 non-merge commits.",
          "[Full changelog comparison](https://github.com/AruNi-01/atmos/compare/desktop-v2.0.0...desktop-2026.7.2)",
        ],
      },
    },
  },
  {
    id: "desktop-2026.6.23",
    title: {
      zh: "Kanban 工作区 · Code Review · 远程连接 · 自动化 · 独立 CLI",
      en: "Kanban Workspaces, Code Review, Remote Access, Automations & Standalone CLI",
    },
    description: {
      zh: "Atmos Desktop 2026.6.23 把 2026.4.6 之后的大版本能力集中成一个稳定版：项目管理升级为可拖拽 Kanban 和 GitHub Issue 导入，Code Review 支持内联评论与 revision 线程，Atmos Computer 与 Hosted Web 带来远程连接，本地模型运行时、Canvas/Appshots、自动化和移动端 MVP 进入主线，同时 CLI 与 Local Web Runtime 解耦为独立安装和更新路径。",
      en: "Atmos Desktop 2026.6.23 stabilizes the major work since 2026.4.6: project management now includes drag-and-drop Kanban and GitHub Issue import, Code Review adds inline comments and revision threads, Atmos Computer and Hosted Web bring remote access, local model runtime, Canvas/Appshots, automations, and the mobile MVP move into the main product line, and the CLI plus Local Web Runtime are decoupled into standalone install and update paths.",
    },
    date: "2026-06-23",
    version: "2026.6.23",
    releaseUrl: "https://github.com/AruNi-01/atmos/releases/tag/desktop-v2.0.0",
    tags: [
      { zh: "工作区", en: "Workspace" },
      { zh: "远程运行时", en: "Remote Runtime" },
      { zh: "自动化", en: "Automations" },
      { zh: "CLI", en: "CLI" },
    ],
    content: {
      zh: {
        features: [
          "**Workspace Kanban 与创建流程** — 新增可拖拽 Kanban、GitHub Issue 导入、工作区创建向导、分组/置顶侧边栏，以及更完整的 issue/PR 关联流程，让项目管理直接进入 Atmos 工作区。",
          "**Code Review 全面升级** — Review 支持 diff header/gutter 内联评论、跨 revision 继承的讨论线程、独立 Review 侧栏、revision 快照、终端修复 runner 和更清晰的 diff 树视图。",
          "**Atmos Computer 与 Hosted Web** — 新增 relay 驱动的远程电脑连接、Cloudflare Pages 托管 Web 入口、本地/远程 Atmos Server 连接流程，以及更稳定的 relay keepalive 和重连体验。",
          "**本地模型运行时与更多 Agent** — 引入托管的本地 llama 运行时、自定义 Hugging Face GGUF 导入、统一 `context_window` 截断策略，并扩展 Cursor、Gemini CLI、Factory Droid、Kiro、Devin、Windsurf 等 Agent 支持。",
          "**Canvas、Appshots 与移动端 MVP** — Canvas Agent 获得活动流、布局命令和更稳定的 tldraw v5 基础；Appshots 打通桌面截图到 Web 历史；首个 Expo 移动端 MVP 支持通过 relay 访问工作区终端。",
          "**本地自动化与 GitHub Issue Automation** — 新增本地自动化运行面板、计划/手动运行、终端 Agent 执行、运行产物、桌面/Web 通知，以及基于 GitHub issue label 的自动化评估与执行流程。",
        ],
        improvements: [
          "**独立 CLI 与 Local Web Runtime 分发** — Desktop、Local Web Runtime 和直接 CLI 安装统一收敛到 `~/.atmos/bin/atmos`，并通过 R2 release manifest 获取最新兼容 CLI，减少对 GitHub API 的依赖。",
          "**终端与连接可靠性** — Run terminal tabs 通过 tmux 持久化并切换到 control mode；终端 WebSocket URL 现在跟随 runtime config，跨 Desktop、Hosted Web 和本地 API 模式更稳定。",
          "**首屏与 Hosted Web 体验** — 启动时预取 bootstrap、WebSocket、project/workspace 数据；欢迎页和侧边栏加入 skeleton loading，Hosted Web 的 onboarding 与连接恢复也更稳。",
          "**导航与信息架构打磨** — 新增分组 center-stage tabs、全局搜索入口、AI Usage footer carousel、右侧栏/文件树布局设置、设置页入口扩展和更清晰的管理中心。",
        ],
        fixes: [
          "**工作区与 Review 稳定性** — 修复 workspace setup 可能因 PTY EOF 缺失而挂起的问题，区分 PR/Issue setup 路径，并修复 Review、metadata、label source 和 workspace 导航相关回归。",
          "**终端输入与重连问题** — 修复 Tauri paste、Shift+Enter、图片剪贴板、scrollback resync、隐藏关闭按钮和 reconnect 后 agent status 识别等终端问题。",
          "**Canvas 与预览稳定性** — 修复 canvas 点击后视口空白、camera/zoom 异常、preview selection、fullscreen layering 和本地服务 loopback URL 相关问题。",
          "**更新与本地服务探测** — CLI 更新改用 R2 manifest 并选择兼容平台资产；IPv6 本地服务探测 URL 正确加括号；Hosted/local 检测和 retry 布局也更可靠。",
        ],
        others: [
          "本条目合并了前序 RC 与 beta 阶段的主要稳定化成果，预发布版本不单独展示。",
          "[完整变更对比](https://github.com/AruNi-01/atmos/compare/desktop-v1.0.0...desktop-v2.0.0)",
        ],
      },
      en: {
        features: [
          "**Workspace Kanban & creation flow** — Added drag-and-drop Kanban, GitHub Issue import, the workspace creation wizard, grouped and pinned sidebars, and fuller issue/PR linking directly inside Atmos workspaces.",
          "**Code Review overhaul** — Review now supports inline comments in diff headers and gutters, threaded conversations inherited across revisions, a dedicated Review sidebar, revision snapshots, a terminal fix runner, and clearer diff tree navigation.",
          "**Atmos Computer & Hosted Web** — Added relay-powered remote computer access, a Cloudflare Pages hosted web entry point, local/remote Atmos Server connection flows, and more reliable relay keepalive and reconnect behavior.",
          "**Local model runtime & more agents** — Introduced the managed local llama runtime, custom Hugging Face GGUF imports, a unified `context_window` truncation strategy, and expanded support for Cursor, Gemini CLI, Factory Droid, Kiro, Devin, and Windsurf.",
          "**Canvas, Appshots & mobile MVP** — Canvas Agent gained activity feeds, layout commands, and a more stable tldraw v5 foundation; Appshots connects desktop captures to web history; the first Expo mobile MVP can reach workspace terminals through the relay.",
          "**Local automations & GitHub Issue Automation** — Added local automation surfaces, scheduled and manual runs, terminal-agent execution, run artifacts, desktop/web notifications, and GitHub issue label based judging and execution.",
        ],
        improvements: [
          "**Standalone CLI & Local Web Runtime distribution** — Desktop, Local Web Runtime, and direct CLI installs now converge on `~/.atmos/bin/atmos`, with R2 release manifests used to resolve the latest compatible CLI and reduce dependence on GitHub API availability.",
          "**Terminal and connection reliability** — Run terminal tabs persist through tmux and use control mode; terminal WebSocket URLs now follow runtime config for steadier Desktop, Hosted Web, and local API connections.",
          "**First-screen and Hosted Web experience** — Startup prefetches bootstrap, WebSocket, project, and workspace data while the splash screen is visible; the welcome surface and sidebar now show skeleton loading, and Hosted Web onboarding/recovery is less fragile.",
          "**Navigation and information architecture polish** — Added grouped center-stage tabs, broader global search, the AI Usage footer carousel, right-sidebar/file-tree layout settings, expanded settings entries, and a clearer management center.",
        ],
        fixes: [
          "**Workspace and Review stability** — Fixed workspace setup hangs caused by missing PTY EOF, clarified PR vs Issue setup paths, and addressed Review, metadata, label-source, and workspace navigation regressions.",
          "**Terminal input and reconnect issues** — Fixed Tauri paste, Shift+Enter, clipboard image handling, scrollback resync, hidden close buttons, and agent status identification after reconnect.",
          "**Canvas and preview stability** — Fixed canvas viewport blanking after clicks, camera/zoom recovery, preview selection, fullscreen layering, and local-service loopback URL handling.",
          "**Updates and local service probing** — CLI updates now use the R2 manifest and choose compatible platform assets; IPv6 local-service probe URLs are bracketed correctly; hosted/local detection and retry layout are more reliable.",
        ],
        others: [
          "This entry rolls up the major stabilization work from the preceding RC and beta phases; prereleases are intentionally not shown as separate landing changelog entries.",
          "[Full changelog comparison](https://github.com/AruNi-01/atmos/compare/desktop-v1.0.0...desktop-v2.0.0)",
        ],
      },
    },
  },
  {
    id: "desktop-2026.4.6",
    title: {
      zh: "首个正式大版本：隧道连接器 · Agent 实时同步 · 文件树 Git 状态",
      en: "Tunnel Connector, Real-Time Agent Sync & Live Git File Tree",
    },
    description: {
      zh: "Atmos 2026.4.6 是首个正式大版本。本次发布带来了桌面隧道连接器、全 UI 实时 Agent 状态同步、带 Git 状态的实时文件树、顶栏分支同步显示，以及大量稳定性和交互打磨。",
      en: "Atmos 2026.4.6 is our first major release. It brings Tunnel Connector to your desktop, real-time agent state tracking across the entire UI, a live file tree with Git status, branch sync visibility in the top bar, and a range of reliability and polish improvements.",
    },
    date: "2026-04-06",
    version: "2026.4.6",
    releaseUrl: "https://github.com/AruNi-01/atmos/releases/tag/desktop-v1.0.0",
    image: "/changelog/v1.0.0_img.png",
    tags: [
      { zh: "隧道连接器", en: "Tunnel Connector" },
      { zh: "Agent", en: "Agent" },
      { zh: "文件树", en: "File Tree" },
      { zh: "Git", en: "Git" },
    ],
    content: {
      zh: {
        features: [
          "**隧道连接器** — 通过 Tailscale、Cloudflare Tunnel 或 ngrok 从任意位置连接你的 Atmos 桌面端，支持互联网访问和局域网可信 API。([#67](https://github.com/AruNi-01/atmos/pull/67)，关闭 [#26](https://github.com/AruNi-01/atmos/issues/26))",
          "**Agent Hooks 与实时状态同步** — Claude Code、Codex、OpenCode 的 Agent 生命周期事件（运行中、空闲、等待权限、完成）现在通过 hooks 实时同步到侧边栏、底栏和终端标签页。Agent 等待权限时会显示动态铃铛图标。([#63](https://github.com/AruNi-01/atmos/pull/63)，关闭 [#24](https://github.com/AruNi-01/atmos/issues/24)、[#25](https://github.com/AruNi-01/atmos/issues/25))",
          "**实时文件树与 Git 状态** — 文件树实时更新，并展示每个文件的 Git 状态标识（已修改、已新增、已删除），无需离开编辑器即可掌握改动全貌。",
          "**顶栏分支同步状态** — 顶栏实时显示当前分支是否领先、落后或与远程同步，随时掌握 Git 状态。([#66](https://github.com/AruNi-01/atmos/pull/66))",
          "**技能面板全面改版** — 技能面板与设置弹窗采用全新布局，支持列表与详情视图的平滑切换动画、自定义 Agent SVG 图标及新增的 SkillAgentBadge 组件。([#67](https://github.com/AruNi-01/atmos/pull/67))",
        ],
        fixes: [
          "**PTY 泄漏修复** — 修复页面刷新时终端 PTY 会话未正确释放的问题，现在使用稳定分组名称防止跨刷新积累。([#68](https://github.com/AruNi-01/atmos/pull/68)，关闭 [#64](https://github.com/AruNi-01/atmos/issues/64))",
          "**Agent 权限响应延迟与卡死** — 修复用户授权后 Claude Code 仍显示卡住的问题，权限回复处理更可靠，Agent 能及时恢复运行。",
          "**隧道连接器 HTTPS 隧道连通性** — 修复 HTTPS 隧道连接问题，并新增 session 续期，在网络条件不佳时保持隧道连接器会话存活。",
          "**阻塞异步执行器与硬编码 Sidecar 端口** — 修复 sidecar 阻塞异步执行器的问题，并移除导致部分环境无法启动的硬编码端口。",
          "**Agent 对话面板透明度** — 恢复因重构误删的 Agent 对话面板透明度控制。",
          "**旋转图标对齐** — 修复用量和计时 UI 中旋转图标错位的问题。([#38](https://github.com/AruNi-01/atmos/issues/38))",
          "**桌面端终端拖放** — 修复桌面端终端面板的拖放行为异常。",
          "**终端标签页 Hydration** — 修复桌面端启动时终端标签页 hydration 失败的问题。",
        ],
        improvements: [
          "**空闲会话徽章** — 在侧边栏悬停空闲 Agent 会话时，会以滑入动画展示 CLEAR 操作，无需跳转页面即可快速清理已完成的会话。",
          "**Agent 状态指示器尺寸** — 侧边栏和终端标签页中的紧凑 Agent 状态指示器适当放大，在小尺寸下更易辨识。",
          "**桌面端应用图标刷新** — 更新桌面端应用图标，在 macOS 上呈现更精致的外观。",
          "**Landing Changelog 页面** — Landing 站点正式上线 Changelog 页面及共享 CTA 组件。([#69](https://github.com/AruNi-01/atmos/pull/69))",
        ],
        others: [
          "[完整变更对比](https://github.com/AruNi-01/atmos/compare/desktop-v0.2.6...desktop-v1.0.0)",
        ],
      },
      en: {
        features: [
          "**Tunnel Connector** — Connect to your Atmos desktop from anywhere using Tailscale, Cloudflare Tunnel, or ngrok. Enable the built-in web service and share access over the internet or your local network, with opt-in LAN trust for the API. ([#67](https://github.com/AruNi-01/atmos/pull/67), closes [#26](https://github.com/AruNi-01/atmos/issues/26))",
          "**Agent Hooks & Real-Time State Sync** — Agent lifecycle events (running, idle, waiting for permission, complete) now flow through hooks for Claude Code, Codex, and OpenCode, keeping the sidebar, footer, and terminal tabs in sync in real time. An animated bell icon appears when an agent is waiting for your permission. ([#63](https://github.com/AruNi-01/atmos/pull/63), closes [#24](https://github.com/AruNi-01/atmos/issues/24), [#25](https://github.com/AruNi-01/atmos/issues/25))",
          "**Live File Tree with Git Status** — The file tree updates in real time and shows live Git status indicators so you can see which files have been modified, added, or deleted without leaving the editor pane.",
          "**Branch Sync Status in Top Bar** — The top bar now shows whether your current branch is ahead, behind, or in sync with its remote, giving you a quick read on your Git state at all times. ([#66](https://github.com/AruNi-01/atmos/pull/66))",
          "**Skills UI Overhaul** — The skills panel and settings modal have been redesigned with a refreshed layout, smooth view transitions between list and detail views, custom agent SVG icons, and a new SkillAgentBadge component. ([#67](https://github.com/AruNi-01/atmos/pull/67))",
        ],
        fixes: [
          "**PTY Leak on Page Refresh** — Fixed a leak where terminal PTY sessions were not properly released on page refresh. Sessions now use stable grouped names to prevent accumulation across reloads. ([#68](https://github.com/AruNi-01/atmos/pull/68), closes [#64](https://github.com/AruNi-01/atmos/issues/64))",
          "**Agent Permission Latency & Stuck State** — Resolved a bug where Claude Code would appear stuck after the user granted a permission prompt. Permission reply handling is now more reliable and the agent resumes promptly.",
          "**Tunnel Connector HTTPS Tunnel Connectivity** — Fixed connectivity issues with HTTPS tunnels and added session renewal to keep Tunnel Connector sessions alive under adverse network conditions.",
          "**Blocking Async Executor & Hardcoded Sidecar Port** — Fixed a case where the sidecar was blocking the async executor and removed a hardcoded port that prevented the sidecar from starting in some environments.",
          "**Agent Chat Panel Opacity** — Restored opacity control for the agent chat panel that was inadvertently removed in a prior refactor.",
          "**Spinning Icon Alignment** — Corrected misaligned spinner icons in the usage and timer UI. ([#38](https://github.com/AruNi-01/atmos/issues/38))",
          "**Desktop Terminal Pane Drag and Drop** — Fixed drag-and-drop behavior in the desktop terminal pane.",
          "**Terminal Tab Hydration** — Fixed an issue where terminal tabs would fail to hydrate correctly on desktop app startup.",
        ],
        improvements: [
          "**Idle Session Badge** — Hovering over an idle agent session in the sidebar now reveals a CLEAR action with a slide animation, making it easier to dismiss finished sessions without navigating away.",
          "**Agent State Indicator Sizing** — The compact agent state indicator in the sidebar and terminal tab is now slightly larger for better visibility at a glance.",
          "**Desktop App Icons Refresh** — Updated desktop app icons for a more polished look on macOS.",
          "**Landing Changelog Page** — A changelog page and shared CTA components are now live on the Atmos landing site. ([#69](https://github.com/AruNi-01/atmos/pull/69))",
        ],
        others: [
          "[Full changelog comparison](https://github.com/AruNi-01/atmos/compare/desktop-v0.2.6...desktop-v1.0.0)",
        ],
      },
    },
  },
  {
    id: "desktop-2026.3.26",
    title: {
      zh: "Landing 页面打磨与预览检查器",
      en: "Landing Polish & Preview Inspector",
    },
    description: {
      zh: "发布 `2026.3.26`，主要带来 landing 页面细节打磨，以及新的跨域预览元素检查能力。",
      en: "Release `2026.3.26` focuses on landing page polish plus a new cross-origin preview element inspector.",
    },
    date: "2026-03-26",
    version: "2026.3.26",
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
    id: "desktop-2026.3.22",
    title: {
      zh: "更顺滑的工作区删除体验",
      en: "Smoother Workspace Deletion",
    },
    description: {
      zh: "发布 `2026.3.22`，把工作区删除改成非阻塞流程，并加入进度 toast。",
      en: "Release `2026.3.22` makes workspace deletion non-blocking and adds progress toasts.",
    },
    date: "2026-03-22",
    version: "2026.3.22",
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
    id: "desktop-2026.3.21",
    title: {
      zh: "预览体验与桌面工作区行为优化",
      en: "Preview UX & Workspace Behavior",
    },
    description: {
      zh: "发布 `2026.3.21`，重点改善预览交互体验，以及桌面端工作区相关行为。",
      en: "Release `2026.3.21` improves preview UX and desktop workspace behavior.",
    },
    date: "2026-03-21",
    version: "2026.3.21",
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
    id: "desktop-2026.3.20",
    title: {
      zh: "终端链接与更新体验升级",
      en: "Terminal Links & Update Flow",
    },
    description: {
      zh: "发布 `2026.3.20`，新增终端链接打开偏好、编辑器跳转和文件树高亮，同时继续打磨更新检查与终端链接体验。",
      en: "Release `2026.3.20` adds terminal link preferences, editor jump-to-line, file-tree reveal, and continued polish for update checks and link handling.",
    },
    date: "2026-03-20",
    version: "2026.3.20",
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
    id: "desktop-2026.3.19",
    title: {
      zh: "终端搜索与设置面板刷新",
      en: "Terminal Search & Settings Refresh",
    },
    description: {
      zh: "发布 `2026.3.19`，围绕终端搜索、图片支持、设置面板和启动体验做了一轮集中更新。",
      en: "Release `2026.3.19` bundles terminal search, image support, settings refresh, and splashscreen polish.",
    },
    date: "2026-03-19",
    version: "2026.3.19",
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
    id: "desktop-2026.3.18-updates",
    title: {
      zh: "自动更新正式上线",
      en: "Automatic Updates Arrive",
    },
    description: {
      zh: "发布 `2026.3.18`，带来应用内更新、设置面板和 Homebrew tap，同时补齐桌面端发布基础设施。",
      en: "Release `2026.3.18` introduces in-app updates, a settings modal, Homebrew distribution, and the supporting release infrastructure.",
    },
    date: "2026-03-18",
    version: "2026.3.18-2",
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
    id: "desktop-2026.3.18-terminal",
    title: {
      zh: "桌面终端体验大升级",
      en: "Desktop Terminal Overhaul",
    },
    description: {
      zh: "发布 `2026.3.18`，重点升级桌面终端滚动与性能体验，同时加入 AI token 成本估算和 Cursor 会话同步。",
      en: "Release `2026.3.18` overhauls desktop terminal behavior and adds AI token cost estimates plus Cursor usage sync.",
    },
    date: "2026-03-18",
    version: "2026.3.18-1",
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
    id: "desktop-2026.3.15",
    title: {
      zh: "GitHub Issue 关联工作流上线",
      en: "GitHub Issue Workflow Lands",
    },
    description: {
      zh: "早期预览版 `2026.3.15` 把 GitHub Issue 关联、LLM 生成 TODO 和更稳的工作区创建流程一起带进了桌面端。",
      en: "Early preview `2026.3.15` brings GitHub Issue linking, LLM-generated TODOs, and a more resilient workspace creation flow to the desktop app.",
    },
    date: "2026-03-15",
    version: "2026.3.15",
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
    id: "desktop-2026.3.13",
    title: {
      zh: "首个桌面版发布",
      en: "First Desktop App Release",
    },
    description: {
      zh: "这是 `2026.3.13` 的首个桌面版发布，当时仅提供 macOS ARM 构建。",
      en: "This was the first desktop app release under `2026.3.13`, initially shipping only a macOS ARM build.",
    },
    date: "2026-03-13",
    version: "2026.3.13",
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
