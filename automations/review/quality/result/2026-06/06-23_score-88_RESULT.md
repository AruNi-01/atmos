# Atmos main 每日代码质量评分 - 2026-06-23

## 1. 审查范围

- 审查时间窗口：2026-06-22 00:00:00 +0800 至 2026-06-22 23:59:59 +0800。
- 审查分支：`main`。
- 已排除纯 automation 结果归档提交：`5f66ecb3 docs: record quality review PR link`。
- 说明：`facf535c`、`1bc03600`、`26bbea10` 同时包含结果文件和真实代码变更，因此只按真实代码变更部分纳入审查；`6e4c7f55` 是 merge commit，无独立 diff，仅记录合并事实。

被审查提交：

| Commit | Author | Message |
| --- | --- | --- |
| `26bbea10` | AarynLu | `refactor: address daily quality findings for 2026-06-21` |
| `facf535c` | AarynLu | `fix: avoid node_modules script path in video scaffold` |
| `1bc03600` | AarynLu | `fix: ignore generated gsap runtime asset` |
| `6e4c7f55` | AruNi_Lu | `Merge pull request #129 from AruNi-01/codex/quality-fix/2026-06-22` |
| `ef02b724` | AarynLu | `Support Hermes prompt flag query syntax` |
| `7feb4da4` | AarynLu | `Add prompt stashing to diff annotations` |
| `ab28ac51` | AarynLu | `chore(local-runtime): bump version to 0.2.0-beta.10` |
| `03c5933a` | AarynLu | `chore(desktop): release 1.2.0-beta.15` |
| `7128d21f` | AarynLu | `Guard Hermes executable permissions on non-Unix` |
| `81a3bb4d` | AarynLu | `Bump atmos-desktop to 1.2.0-beta.15` |
| `3021e1c7` | AarynLu | `Remove local runtime alias and add JSON CLI output` |
| `e8b5b340` | AarynLu | `chore(cli): release 0.2.0` |
| `15792de7` | AarynLu | `chore(local-runtime): release 0.2.0-beta.11` |
| `6bb8aa5a` | AarynLu | `chore(desktop): release 1.2.0-beta.16` |
| `ec76931b` | AarynLu | `fix(web): keep local retry button in header row` |
| `48e91373` | AarynLu | `chore(local-runtime): release 0.2.0` |
| `6b73e7c6` | AarynLu | `fix(web): preserve hosted local detection on reconnect failure` |
| `c5c596de` | AarynLu | `fix(local-runtime): publish npm prereleases with dist tag` |
| `49f2c836` | AarynLu | `fix(local-runtime): keep npm publish opt-in` |
| `9f8c0250` | AarynLu | `fix(local-runtime): stabilize latest installer distribution` |

## 2. 一份好代码应该是什么样

本次采用的标准是：改动应放在清楚的归属层里，单个组件或模块只承担它自然拥有的职责；复杂交互要通过贴合当前问题的抽象拆开，而不是把状态、IO、渲染和副作用都塞进一个入口文件。代码应让维护者能顺着主路径理解行为，版本、配置、manifest、锁文件等工程元数据必须保持一致，避免靠隐式记忆维持正确性。

## 3. 评分方法

- 100 分制。
- 设计与分层 30 分：职责边界、模块耦合、分层方向、抽象是否贴合。
- 可读性与复杂度 25 分：控制流、状态管理、分支复杂度、理解成本。
- 体量与内聚 20 分：文件、函数、组件体量是否与职责匹配。
- 可维护性与复用 15 分：重复逻辑、共享规则、配置和协议是否集中管理。
- 工程卫生 10 分：命名、注释、错误处理、日志、调试残留、锁文件和 release 元数据一致性。
- 高严重度问题通常单项扣 8-15 分；中严重度问题扣 3-7 分；低严重度问题扣 1-2 分。体量阈值只作为信号，只有体量超出且职责确实变差时扣分。

## 4. 总分

**88 / 100。总体判断：良好。**

当天多数改动沿既有边界推进，Hermes manifest、发布 workflow、runtime installer 和 generated asset 处理都有正向收口。但 `ChangesCodeView.tsx` 新增 prompt stash 后把多个交互职责继续集中到一个 900+ 行组件里，形成明确的维护风险；另有一次 desktop release bump 未同步 `Cargo.lock`。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 26 / 30 | `7feb4da4` 将 prompt stash 状态机、annotation mutation、prompt 构造、toolbar chip 渲染继续放进 `apps/web/src/features/diff/components/ChangesCodeView.tsx`，让 diff 加载/导航组件承担新的交互子系统职责。 |
| 可读性与复杂度 | 22 / 25 | `ChangesCodeView.tsx` 同时维护加载批次、滚动导航、collapse、path map、draft notes、stashed prompts 和 clipboard 行为，主路径阅读成本上升。 |
| 体量与内聚 | 17 / 20 | 同一组件从 479 行增长到 964 行，超过高风险 UI 组件阈值；新增代码有清晰拆分点但未在提交中拆出。 |
| 可维护性与复用 | 14 / 15 | 多数跨端 manifest 变更有测试同步；但 prompt stash 行为没有形成独立 hook/component，后续扩展会继续扩大主组件。 |
| 工程卫生 | 9 / 10 | `6bb8aa5a` 将 `apps/desktop/src-tauri/Cargo.toml` bump 到 `1.2.0-beta.16`，但 `Cargo.lock` 仍记录 `atmos-desktop` 为 `1.2.0-beta.15`。 |

## 6. 主要问题清单

### 高：prompt stash 让 diff 主组件职责继续膨胀

- 提交：`7feb4da4 Add prompt stashing to diff annotations`
- 文件：`apps/web/src/features/diff/components/ChangesCodeView.tsx:107`、`apps/web/src/features/diff/components/ChangesCodeView.tsx:265`
- 问题：新增的 `stashedPromptState`、`draftNoteState`、copy/stash/dismiss handler、prompt 构造、批量复制 chip 和 annotation 渲染全部内联在 `ChangesCodeView` 中。该文件已经同时承担 diff 文件加载、CodeView 装配、滚动定位、collapse、active file 同步和 selection handling，新增功能把组件推到 964 行。
- 为什么是质量问题：这不是单纯行数问题，而是新的 prompt annotation 子系统和原 diff viewer 生命周期交织在一个组件里。后续要调整 prompt 文案、stash 交互、annotation 去重或 clipboard 失败行为时，都必须穿过加载和导航逻辑，回归风险变高。
- 优化建议：把 prompt stash 相关状态和 UI 提取到 `apps/web/src/features/diff/components/useDiffPromptStash.tsx` 或同级 feature-local hook/component 中。主组件只传入 `codeViewRef`、`loadedContentsRef` 和 scope，并接收 `openCopyAnnotation`、`renderAnnotation`、`stashedPromptChip`。这样 `ChangesCodeView` 保持 diff viewer orchestration 职责，prompt annotation 子系统独立演进。

### 中：desktop release bump 未同步 Cargo.lock

- 提交：`6bb8aa5a chore(desktop): release 1.2.0-beta.16`
- 文件：`apps/desktop/src-tauri/Cargo.toml:3`、`Cargo.lock:530`
- 问题：`apps/desktop/src-tauri/Cargo.toml` 中 `atmos-desktop` 已是 `1.2.0-beta.16`，但同一 main 状态下 `Cargo.lock` 仍记录 `1.2.0-beta.15`。
- 为什么是质量问题：release bump 属于工程元数据变更，锁文件与 manifest 不一致会让后续 `cargo test` / `cargo build` 在本地自动改写锁文件，给下一位维护者留下不必要的脏 diff，也可能遮蔽真正的 dependency 变化。
- 优化建议：release bump 后运行对应 cargo 命令或显式更新锁文件，并把 `Cargo.lock` 同步提交。对桌面 release 流程可补一条检查：release PR 中 `apps/desktop/src-tauri/Cargo.toml` 改版本时，`Cargo.lock` 的 `atmos-desktop` entry 必须同版本。

## 7. 正向观察

- `ef02b724` 修改 Hermes prompt flag 语义时，同步更新了 `resources/terminal-agents/builtin_agents.json`、Rust automation resolver 测试和 Web AgentSelect 测试，符合 terminal-agent manifest 双端消费规则。
- `7128d21f` 用 `#[cfg(unix)]` / `#[cfg(not(unix))]` 收口 Hermes executable permission 处理，避免非 Unix 平台引入不可编译路径。
- `facf535c` / `1bc03600` 把 GSAP runtime asset 从已提交文件调整为安装后同步生成，减少 generated artifact 污染。
- local runtime 发布 workflow 的 npm publish 被改为显式 opt-in，并按 prerelease 推导 npm tag，发布边界比默认自动发布更清楚。
- Hosted welcome 的本地检测重试入口是局部 UI 改动，没有引入新的 transport 或绕开现有 hosted connection store。

## 8. Review 建议

人工 review 最值得盯：

1. Diff viewer 相关改动是否继续把新交互状态塞进 `ChangesCodeView.tsx`，尤其是 selection、annotation、clipboard、toolbar 类逻辑。
2. Release/version bump 是否同步更新对应 lockfile、package manifest、Tauri config 和 release notes。
3. Terminal agent manifest 变更是否仍同时覆盖 TS UI adapter 和 Rust automation resolver。

## 9. 自动修复与 PR

已触发自动修复，因为总分 **88 < 90**。

- 修复分支：`codex/quality-fix/2026-06-22-0807`
- 修复提交：`e7a967d6 refactor: address daily quality findings for 2026-06-22`
- PR：https://github.com/AruNi-01/atmos/pull/130
- 标签：已添加 `codex`；仓库中未找到 `codex-automation`，因此跳过该标签。
- 修复内容：
  - 新增 `apps/web/src/features/diff/components/useDiffPromptStash.tsx`，承接 prompt stash 状态、annotation mutation、prompt 构造、chip UI 和 copy/stash/dismiss 行为。
  - `apps/web/src/features/diff/components/ChangesCodeView.tsx` 改为只调用 hook 返回的 `openCopyAnnotation`、`renderAnnotation` 和 `stashedPromptChip`，主组件从 964 行降至 582 行。
  - `apps/web/src/features/diff/lib/code-view-ui.tsx` 增加 direct header renderer，避免本次组件在 render 阶段通过工厂传 ref 触发 React lint。
  - `Cargo.lock` 中 `atmos-desktop` 版本同步为 `1.2.0-beta.16`。
- 验证：
  - `bun --filter web lint -- src/features/diff/components/ChangesCodeView.tsx src/features/diff/components/useDiffPromptStash.tsx src/features/diff/lib/code-view-ui.tsx` 通过。
  - `bun --filter web typecheck` 通过。
  - `bun test apps/web/src/features/wiki/components/__tests__/agent-select.test.ts` 通过，5 tests passed。
  - `cargo test -p atmos` 通过，当前 crate 无单元测试。
  - `cargo test -p core-service s11_supported_builtin_agent_commands_use_declared_prompt_strategies` 通过；存在既有 `resolve_interactive_automation_agent` dead code warning。
  - `bash -n install-local-web-runtime.sh` 通过。
  - `node --check packages/local-installer/bin/atmos-local.mjs && node --check marketing/creative/projects/atmos-intro/hyperframes/scripts/sync-runtime-assets.mjs && node --check .agents/skills/atmos-video-gen/scripts/scaffold-atmos-video-project.mjs` 通过。
  - `git diff --check` 通过。
- 剩余风险：`ChangesCodeView.tsx` 仍有 582 行，后续若继续扩展 diff loading、导航或 toolbar 行为，建议再拆出加载/导航 hook；本次 PR 只修复昨天新增 prompt stash 导致的职责膨胀。

## 10. 结果文件

本次结果文件路径：`automations/review/quality/result/2026-06/06-23_score-88_RESULT.md`

## 11. 结果提交与推送

- 结果文件随修复 PR 分支 `codex/quality-fix/2026-06-22-0807` 推送到 `origin`。
- 修复代码提交 hash：`e7a967d6`
- PR URL：https://github.com/AruNi-01/atmos/pull/130
- 结果文件提交 hash：本文件提交后由最终回复记录。
