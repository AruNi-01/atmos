# Atmos Main 每日代码质量评分（2026-06-21）

## 1. 审查范围

- 审查窗口（UTC+8）：2026-06-21 00:00:00 ~ 2026-06-21 23:59:59
- 被审查提交（非 automation 结果归档）：
  - `52e4b133` Refine runtime and app workflows — AarynLu
  - `77db8e00` Refine mobile cache keys and terminal attach handling — AarynLu
  - `a726ff52` Make terminal DOM commands return success — AarynLu
  - `366ba7be` Reorganize agent reference docs — AarynLu
  - `1e19ed9b` chore: bump CLI to v0.2.0-beta.9 — AarynLu
  - `4ac46441` chore(local-runtime): bump version to 0.2.0-beta.9 — AarynLu
  - `7fefa3a7` chore: remove next proxy middleware, update lockfile — AarynLu
  - `fce195a9` chore(desktop): release 1.2.0-beta.14 — AarynLu
  - `c024c9d6` Add Atmos audio generation skill — AarynLu
  - `3bc74156` Add Atmos marketing creative workflow — AarynLu
  - `13d7768d` Refactor specs workflow and frontend polish — AarynLu
  - `1f4595ce` Refine mobile native controls and workspace status menus — AarynLu
- 排除项：无。昨日窗口内没有只修改 `automations/review/quality/result/` 的 automation 结果归档提交。
- 辅助验证：
  - `node --check` 通过：`.agents/skills/atmos-audio-gen/scripts/create-continuous-audio-script.mjs`、`.agents/skills/atmos-video-gen/scripts/scaffold-atmos-video-project.mjs`、`marketing/creative/projects/atmos-intro/hyperframes/scripts/generate-audio.mjs`、`marketing/creative/projects/atmos-intro/hyperframes/scripts/render-video.mjs`
  - 修复前 `cargo test -p api terminal_` 通过但会更新 `Cargo.lock`；修复后 `cargo test --locked -p api terminal_` 通过：2 个 relay terminal 单测通过
  - `bun --filter @atmos/mobile typecheck` 未能执行完成：当前环境缺少 `node_modules/expo`，报 `File 'expo/tsconfig.base' not found`；不把该环境问题计入当天代码质量扣分
  - `git diff --check` 有空白问题，计入低严重度工程卫生扣分

## 2. 一份好代码应该是什么样

- 本次采用的标准是：改动应沿着 Atmos 既有分层走，移动端 UI、状态控制、WS action、API relay 和 marketing creative 目录各自守住职责边界。
- 好代码应让后续维护者能快速找到修改点：交互状态、协议 DTO、终端连接生命周期、creative scaffold 模板和生成脚本不应互相缠在一个难以拆分的块里。
- 对于脚本和生成物，允许文件偏大，但模板、IO、CLI 参数、渲染流程和音频合成策略要有清晰边界，不能因为是工具脚本就放弃可维护性。

## 3. 评分方法

- 100 分制，五维度：
  - 设计与分层：30 分
  - 可读性与复杂度：25 分
  - 体量与内聚：20 分
  - 可维护性与复用：15 分
  - 工程卫生：10 分
- 严重度口径：
  - 高严重度通常扣 8-15 分：明显跨层、核心控制流难以维护、超大混杂职责。
  - 中严重度通常扣 3-7 分：局部抽象不稳、模板/状态/IO 混在一起、函数或文件明显过长且有拆分点。
  - 低严重度通常扣 1-2 分：空白、轻微重复、局部依赖不够稳定、命名或组织小瑕疵。
- 体量阈值不是机械扣分项；只有当文件变大同时职责也混杂时才扣分。

## 4. 总分

- 总分：**89**
- 总体判断：良好

## 5. 分项评分

- 设计与分层：28/30
  - 扣分：2
  - 原因：移动端仍坚持 WS-first，terminal WebView 也没有接收 Access Token 或 relay secret，边界总体良好；扣分主要来自 creative scaffold 脚本把 CLI、模板、渲染脚本生成和 consumer 同步策略放在单文件内，工具边界略显含混。
  - 涉及提交：`3bc74156`

- 可读性与复杂度：23/25
  - 扣分：2
  - 原因：新增 creative/audio scaffold 脚本包含多层长模板字符串，阅读时需要在“生成器代码”和“被生成代码”之间来回切换，局部维护成本偏高。
  - 涉及提交：`c024c9d6`、`3bc74156`

- 体量与内聚：18/20
  - 扣分：2
  - 原因：`.agents/skills/atmos-video-gen/scripts/scaffold-atmos-video-project.mjs` 592 行、`.agents/skills/atmos-audio-gen/scripts/create-continuous-audio-script.mjs` 447 行，且都不是纯数据表或生成文件；它们有明确的模板拆分点。
  - 涉及提交：`c024c9d6`、`3bc74156`

- 可维护性与复用：13/15
  - 扣分：2
  - 原因：video scaffold 已声明 `gsap` 依赖，但默认 `index.html` 模板仍依赖 CDN，生成项目的渲染稳定性和离线复现性弱于实际落地项目中使用本地 asset 的做法；同时 `fce195a9` 将桌面 crate 升到 `1.2.0-beta.14` 后，`HEAD:Cargo.lock` 仍记录 `atmos-desktop` 为 `1.2.0-beta.13`，release 元数据没有同步。
  - 涉及提交：`3bc74156`、`fce195a9`

- 工程卫生：7/10
  - 扣分：3
  - 原因：主线代码没有发现调试日志、秘密信息泄漏或临时开关；但 `git diff --check` 对新增文件报出空白问题，并且 `cargo test` 会把 stale `Cargo.lock` 改成新版本，说明 release commit 留下了可被验证命令触发的锁文件漂移。

## 6. 主要问题清单

### 中

1. 桌面 release 版本与 `Cargo.lock` 不一致
- 提交：`fce195a9`
- 文件：`apps/desktop/src-tauri/Cargo.toml:3`、`Cargo.lock:530`
- 问题：`apps/desktop/src-tauri/Cargo.toml` 已将 `atmos-desktop` 升到 `1.2.0-beta.14`，但 `HEAD:Cargo.lock` 仍记录 `1.2.0-beta.13`。本次运行 `cargo test -p api terminal_` 时，Cargo 自动把 lockfile 改成 beta.14，暴露出主分支锁文件未同步。
- 为什么这是质量问题：release commit 应保持 manifest 与 lockfile 一致；否则 `cargo --locked` 类检查、CI 或本地验证会因为锁文件漂移失败或留下脏工作树。
- 优化建议：将 `Cargo.lock` 中 `atmos-desktop` 版本同步到 `1.2.0-beta.14`，并在 desktop release workflow 中加入 `cargo metadata --locked` 或目标 `cargo test --locked` 检查，确保版本 bump 后不会漏提 lockfile。

2. Creative scaffold 脚本用长模板字符串同时承载模板、渲染流程和文件写入
- 提交：`3bc74156`
- 文件：`.agents/skills/atmos-video-gen/scripts/scaffold-atmos-video-project.mjs:123`, `.agents/skills/atmos-video-gen/scripts/scaffold-atmos-video-project.mjs:254`, `.agents/skills/atmos-video-gen/scripts/scaffold-atmos-video-project.mjs:333`
- 问题：`projectAgents`、`indexHtml`、`renderScript` 等函数在同一脚本中直接返回大块 Markdown、HTML、JS 模板；`renderScript` 又内嵌 Playwright 截帧、ffmpeg 编码和 consumer copy 逻辑。修改模板内容、渲染策略或 app 同步规则时必须编辑同一个 592 行脚本，且容易混淆生成器上下文与被生成脚本上下文。
- 为什么这是质量问题：这是中等规模的职责混合。工具脚本不在核心运行链路上，但它会成为后续所有 marketing creative 项目的模板源，模板错误会被复制到新项目，维护成本会随项目数量放大。
- 优化建议：把模板拆成 `.agents/skills/atmos-video-gen/templates/AGENTS.md.tmpl`、`DESIGN.md.tmpl`、`SCRIPT.md.tmpl`、`index.html.tmpl`、`render-video.mjs.tmpl`，脚本只负责参数解析、变量替换和文件写入；把 `consumerTargets` 的生成收敛成独立 `buildConsumerTargets(consumer, projectName)`，避免把 app copy 规则写在长模板中。

3. Audio generator scaffold 把音频合成实现整段嵌入生成器
- 提交：`3bc74156`
- 文件：`.agents/skills/atmos-audio-gen/scripts/create-continuous-audio-script.mjs:137`, `.agents/skills/atmos-audio-gen/scripts/create-continuous-audio-script.mjs:191`
- 问题：`generatorTemplate` 既定义 cue 数据，又直接返回完整的音频合成脚本。音色、节奏、混响、WAV 写入、输出路径等逻辑都藏在一个嵌套模板字符串中，后续想调整音频策略或复用 WAV 写入逻辑都需要在字符串内部改代码。
- 为什么这是质量问题：模板内部代码无法被单独 lint、测试或复用；`node --check` 只能检查外层生成器，无法保证新参数组合生成出的脚本长期稳定。
- 优化建议：将实际 `generate-audio.mjs` 模板移到模板文件，或者把可复用 DSP/WAV helper 放入 skill-local `lib/`；生成器只注入 `duration`、`bpm`、`outputName` 和 cue JSON。再新增一个最小 smoke：生成临时项目后对产物 `scripts/generate-audio.mjs` 执行 `node --check`。

### 低

4. 默认视频 scaffold 依赖 CDN 版 GSAP，降低离线可复现性
- 提交：`3bc74156`
- 文件：`.agents/skills/atmos-video-gen/scripts/scaffold-atmos-video-project.mjs:233`, `.agents/skills/atmos-video-gen/scripts/scaffold-atmos-video-project.mjs:319`
- 问题：`packageJson` 声明了 `gsap` 依赖，但 `indexHtml` 模板加载 `https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js`。渲染脚本的 `ensureReady` 又等待 `window.gsap`，这会让新 scaffold 的本地 render 依赖外部网络。
- 为什么这是质量问题：creative 产物渲染应该可复现；CDN 依赖让 CI、离线开发或网络波动时的失败原因变得不透明。
- 优化建议：生成项目时把 `node_modules/gsap/dist/gsap.min.js` 复制到 `hyperframes/assets/gsap.min.js`，模板改为 `<script src="./assets/gsap.min.js"></script>`；或者在 scaffold 中直接放置本地 vendor asset，并用 `npm run check` 校验存在性。

5. 新增文件存在 diff 空白问题
- 提交：`366ba7be`、`3bc74156`
- 文件：`agents/references/design/components.md:183`、`agents/references/design/web-desktop.md:61`、`marketing/creative/projects/atmos-intro/hyperframes/assets/gsap.min.js:4`
- 问题：`git diff --check` 报告两个 Markdown 文件末尾多空行，以及 vendored `gsap.min.js` 头部 trailing whitespace。
- 为什么这是质量问题：影响很小，但会让日常 diff/check 输出带噪音，降低工程卫生信号的可信度。
- 优化建议：Markdown 文件删除多余末尾空行；vendored/minified 文件如需保留原样，应在检查脚本中明确排除 vendor asset，否则在纳入仓库前做一次 whitespace 清理。

## 7. 正向观察

- 移动端终端拆分方向明显改善：`TerminalScreen` 从前一日基线约 598 行降到 393 行，并把连接生命周期抽到 `use-terminal-connection.ts`、候选终端合并抽到 `terminal-selection.ts`，还补了 selection 单测。
- 移动端遵守了现有传输边界：workspace 状态更新与 terminal candidates 都走 `wsActions`，没有为移动端新增并行 REST shortcut。
- 终端 DOM/WebView 边界控制较好：`TerminalWebView` 和 DOM 组件只接收 renderer 指令、主题和 session id，没有把 Access Token、`client_token`、relay secret 或 `terminal_ws_url` 传入 DOM 层。
- `SettingsScreen` 虽仍偏大，但本次把行为控制抽到 `use-mobile-settings-controller.ts`，比把 query/mutation/Alert 全塞在 UI 文件里更可维护。
- Marketing creative 目录迁移方向正确：source project 进入 `marketing/creative/...`，deployable copy 进入 `apps/landing/public/videos/`，符合 `marketing/AGENTS.md` 的 runtime 资产边界。

## 8. Review 建议

- 人工 review 优先看 creative scaffold：模板拆分、离线渲染、生成项目 smoke test 是否值得补一轮。
- 移动端重点抽查 terminal attach/reconnect 和 workspace status optimistic update，但从结构上看没有明显跨层问题。
- 对 `git diff --check` 建议决定规则：清理 vendored 文件空白，或在检查脚本中显式排除第三方 minified asset。

## 9. 自动修复与 PR

- 本次触发低分自动修复（总分 < 90）。
- 修复分支：`codex/quality-fix/2026-06-22`
- 已修复：
  - 同步 `Cargo.lock` 中 `atmos-desktop` 版本到 `1.2.0-beta.14`
  - 将 video scaffold 默认 GSAP 加载从 CDN 改为本地 `assets/gsap.min.js`，由生成的 runtime 同步脚本从 npm dependency 按需复制该 asset，并将派生的 `assets/gsap.min.js` 从版本库跟踪中移除、加入 `.gitignore`
  - 清理 `git diff --check` 报出的新增空白问题
- 验证：
  - `git diff --check` 通过
  - `node --check .agents/skills/atmos-video-gen/scripts/scaffold-atmos-video-project.mjs` 通过
  - `node --check .agents/skills/atmos-audio-gen/scripts/create-continuous-audio-script.mjs` 通过
  - `node --check marketing/creative/projects/atmos-intro/hyperframes/scripts/generate-audio.mjs` 通过
  - `node --check marketing/creative/projects/atmos-intro/hyperframes/scripts/render-video.mjs` 通过
  - `node --check marketing/creative/projects/atmos-intro/hyperframes/scripts/sync-runtime-assets.mjs` 通过
  - 临时执行 `scaffold-atmos-video-project.mjs review-smoke --consumer landing --force` 后，对生成的 `scripts/render-video.mjs` 与 `scripts/sync-runtime-assets.mjs` 执行 `node --check` 通过；确认生成的 `.gitignore` 包含 `assets/gsap.min.js`，并用 dummy `node_modules/gsap/dist/gsap.min.js` 验证同步脚本可生成 `assets/gsap.min.js`
  - `cargo test --locked -p api terminal_` 通过
- 未完全修复：
  - creative/audio scaffold 的长模板字符串拆分需要较大结构调整，已保留为 PR review 重点，避免在自动修复中引入高风险重构。
- PR URL：`https://github.com/AruNi-01/atmos/pull/129`
- PR 标签：已添加 `codex`；仓库未找到 `codex-automation`，因此跳过该标签。

## 10. 结果文件

- 本次结果文件：`automations/review/quality/result/2026-06/06-22_score-89_RESULT.md`

## 11. 结果提交与推送

- 结果文件初始提交 hash：`26bbea10`
- 推送目标分支：`codex/quality-fix/2026-06-22`
- PR URL：`https://github.com/AruNi-01/atmos/pull/129`
