# Atmos Main 每日代码质量评分

## 1. 审查范围
- 时间窗口（Asia/Shanghai，绝对时间）：2026-06-08 00:00:00 ~ 2026-06-08 23:59:59
- 审查提交（main 分支，9 个）
  - `26a8af18`	AarynLu	`Add persistent preview browser tabs`
  - `525bce69`	AarynLu	`Refactor automation page state handling`
  - `384436cc`	AarynLu	`feat: add local agent cli routing`
  - `b2fc5160`	AarynLu	`feat(web): add hover peek sidebars`
  - `bb902691`	AarynLu	`fix(diff): preserve file names in narrow sidebars`
  - `f23b8cdb`	AarynLu	`fix(agent): animate generated session titles`
  - `d0cd7790`	AarynLu	`feat: add local run service manager`
  - `d11626f9`	AarynLu	`fix(local-services): improve service controls and loopback urls`
  - `581d6c67`	AarynLu	`fix(run-preview): repair fullscreen layering`
  - `ef52c0af`	AarynLu	`fix(preview-selection): make note controls clickable`

## 2. 一份好代码应该是什么样（本次评分口径）
代码应当遵循清晰的分层边界：页面/路由层只做展示与状态编排，核心规则与推断在服务层，公共能力可复用且低耦合。新增逻辑要有明确命名和可替换边界，避免一次改动包裹过多职责；复杂度应与问题规模匹配，不因“先做通”而形成长尾维护债务。可读性上应能快速定位“谁负责什么”和“为什么这样做”。

## 3. 评分方法
- 总分制：100 分。
- 维度权重
  - 设计与分层：30
  - 可读性与复杂度：25
  - 体量与内聚：20
  - 可维护性与复用：15
  - 工程卫生：10
- 扣分与门槛（按固定规则执行）
  - 高严重度：8-15 分/项
  - 中严重度：3-7 分/项
  - 低严重度：1-2 分/项
- 结构规模阈值
  - 文件：300+ 行进入风险区，500+ 强提示
  - 函数：80+ 中风险，150+ 强风险
  - UI 组件：>250 行通常是中风险

## 4. 总分
- 总分：90
- 总体判断：优秀

## 5. 分项评分
- 设计与分层：29 / 30
  - 扣分原因：`d0cd7790` 在一次新特性引入中聚合了大量 DTO 与业务规则，虽然后续已有拆分动作，昨日时点仍体现出“边界靠语义分组”而非真正分层的偏重。
  - 关联提交：`d0cd7790`

- 可读性与复杂度：24 / 25
  - 扣分原因：`b2fc5160` 在同文件内同时承载面板布局状态机与悬浮 peek 交互细节，阅读路径拉长。
  - 关联提交：`b2fc5160`

- 体量与内聚：18 / 20
  - 扣分原因：`d0cd7790` 的本次提交体量较大且职责交叉，局部路径虽有测试但新代码密度高。
  - 关联提交：`d0cd7790`

- 可维护性与复用：13 / 15
  - 扣分原因：`bb902691` 与 `ChangeSection`/`DiffFileTree` 之间出现了并行的“可见性检测 + ResizeObserver + 重排节流”逻辑，短期内容易出现分歧。
  - 关联提交：`bb902691`

- 工程卫生：6 / 10
  - 扣分原因：局部提交偏好修复性实现，少量命名/抽象可再收敛。
  - 关联提交：`b2fc5160`, `bb902691`

## 6. 主要问题清单
### 中
1. `d0cd7790`（`crates/core-service/src/service/local_services.rs`）
   - 位置：`service_id` 构建逻辑（快照位于 835 行附近）
   - 问题：服务 id 受 `pid`/端口等运行时变量影响，导致同一逻辑服务在重启或重放场景下出现稳定性波动（停启服务/再次点选 stop 时更容易产生“旧引用 + 新实例”错配）。
   - 优化建议：抽成稳定主键策略（优先 owner/workspace 上下文 + 端口 + 启动路径签名），`pid` 仅作为附加防护字段；并把“状态恢复/过期”逻辑与 UI key 映射解耦。

### 中
2. `bb902691`（`apps/web/src/app-shell/sidebar/ChangeSection.tsx` / `apps/web/src/features/diff/components/DiffFileTree.tsx`）
   - 位置：`useShouldHideChangeCounts` 与 `useShouldHideTreeChangeCounts`（提交中均在约 56-156 / 286-376 行）
   - 问题：两处重复实现相同的 DOM 裁剪检测与 `ResizeObserver` 管理路径，后续变更时易出现行为分歧。
   - 优化建议：提取为共享 hook（参数化测量目标/边界策略），两处仅传入 `measurementKey` 与引用关系，避免重复维护。

### 低
3. `b2fc5160`（`apps/web/src/app-shell/PanelLayout.tsx`）
   - 位置：新增 peek 交互 + overlay 计算位于文件内大段逻辑（提交时约 26-30 行常量定义、299-594 行交互实现）
   - 问题：单文件承担“布局编排 + 互动边缘行为”双重职责，短期可用但不利于长期复用和可测。
   - 优化建议：保留 `PanelLayout` 的布局职责，将 peek 交互完全独立为专门文件并聚合事件策略测试；将布局宽度计算抽为一个纯函数，便于单测。

## 7. 正向观察
- `525bce69` 明显改善了 automation 页面复杂状态拆分，状态读取与生命周期更清晰。
- `384436cc` 为本地 agent-cli 增加了配置解析与 provider 映射闭环，并补齐了相关单元测试。
- `d11626f9` 在本地服务 URL 打开链路增加了更明确的本地回环处理，改善了边界一致性。

## 8. Review 建议
- 优先复核这 3 个路径的重构节奏：`local_services` 的服务 ID 与停服验证、侧边栏数量统计显示的共享可见性 hook、`PanelLayout` 悬浮交互隔离。
- 在不改动行为前提下，增加 1-2 个回归用例：
  - local service 停服请求在端口复用/重启情形下的稳定行为
  - 窄侧边栏下文件名展示与数量显示的切换行为
  - sidebar peek 在快速悬停/移出时的悬停窗口稳定性

## 9. 自动修复与 PR
- 未触发。原因：本次总分为 90（>=90），按规则无需自动修复流程。

## 10. 结果文件
- 本次结果文件：`automations/code/result/2026-06-09_11-06-57_score-90_ATMOS_CODE_QUALITY_REVIEW.md`

## 11. 结果提交与推送
- 结果文件已按规则写入。
- 计划提交命令：
  - `git add automations/code/result/2026-06-09_11-06-57_score-90_ATMOS_CODE_QUALITY_REVIEW.md`
  - `git commit -m "docs: add code quality review result 2026-06-09 score 90"`
  - `git push origin main`
