# Review Session Comment Inheritance 技术方案

**Date**: 2026-04-29
**Status**: Implemented
**Related**: `docs/plans/2026-04-22-review-session-design.md`

---

## 问题背景

Review Session 支持多版本迭代：用户在 V1 上评论 → Agent fix → 生成 V2 → 用户继续在 V2 评论 → Agent fix → V3 ...

但之前实现中，当 Agent 完成fix并 finalization 生成新版本（V2）后：

1. **Comments 消失** — 切换到 V2 后看不到任何 V1 的评论线程
2. **Agent 回复仍留在 V1** — Agent 在 fix 过程中回复到 V1 线程上，V2 看不到这些回复
3. **Summary 显示位置错误** — fix run 的 summary 不关联具体 revision，导致 V1 也能看到 V2 的 summary
4. **无法切换版本** — 前端缺少版本选择器，用户无法在 V1/V2 之间切换

核心原因：`finalize_fix_run` 创建新修订版时只继承了 file state（`reviewed` 标记），但没有继承 review comments，也没有将 agent 的回复消息迁移到新版本。

---

## 设计目标

1. V2 的 Comments 应包含 V1 的用户评论和 Agent 回复（完整评论链）
2. 数据不冗余 — 消息不复制，通过 `parent_comment_guid` 关联
3. Agent 回复逻辑上属于 V2 — 从 V1 线程迁移到 V2 继承线程
4. Summary 只在其产生的 revision 上可见
5. 前端支持 V1/V2 版本切换，自动切到最新版本

---

## 数据模型

### 现有字段（已有但未使用）

```
review_comment.parent_comment_guid  -- 指向父版本中的原始线程
```

此字段在初始设计文档中已定义，但 `finalize_fix_run` 从未填充它。

### 继承关系示意

```
V1 Comment A (parent_comment_guid = NULL)
  ├── message: user "为什么要引入这个包？"
  ├── message: user "只用来做测试吗？"
  │
  │  finalize_fix_run 迁移:
  │  - agent 回复消息 → 从 Comment A 移到 Comment A'
  │
  └── V2 Comment A' (parent_comment_guid = Comment A.guid)
       ├── (从 Comment A 迁移过来) message: agent "vitest 是为了支持..."
       └── (后续 V2 用户新评论) message: user "收到，已确认"
```

---

## 实现方案

### 1. 后端：`finalize_fix_run` 线程继承

**文件**: `crates/core-service/src/service/review.rs`

**时机**: 在 file snapshot 和 file state 创建循环之后、更新 session 当前 revision 之前

**步骤**:

```
a. 查询 base revision 的所有线程 (list_comments_by_revision)
b. 维护 snapshot_guid_map: 旧 snapshot GUID → 新 snapshot GUID
c. 为每个 base comment 创建新线程:
   - session_guid: 相同
   - revision_guid: 新 revision
   - file_snapshot_guid: 映射到新 snapshot (通过 map)
   - anchor 信息: 直接继承（行号暂不重映射，v1 不做自动重锚定）
   - status: 继承原状态
   - parent_comment_guid: 指向原始线程 (关联链)
   - title/created_by: 继承
d. 收集 from_guids (原始 GUIDs) 和 to_guids (继承 GUIDs)
e. 将当前 fix run 的 agent 消息从 V1 线程迁移到 V2 继承线程:
   UPDATE review_message SET comment_guid = to_guid
   WHERE comment_guid IN from_guids AND fix_run_guid = current_run_guid
```

**关键设计**:
- Agent 的回复通过 `fix_run_guid` 标识，只迁移属于当前 fix run 的消息
- 用户的原始评论留在 V1 线程中，V2 通过 `parent_comment_guid` 链链接

### 2. 后端：`list_comments` 父链消息合并

**文件**: `crates/core-service/src/service/review.rs`

**问题**: V2 继承线程本身没有直接的消息（agent 消息已迁移到它上面），但用户的原始评论在 V1 父线程中。查询 V2 线程时需要追溯父链。

**方案**:

```
a. 查询当前 revision 的所有线程
b. 识别有 parent_comment_guid 的线程
c. 递归解析父链 (resolve_ancestor_comments)，缓存所有祖先线程
d. 批量加载祖先线程的消息
e. 对有 parent_comment_guid 的线程：
   - 本线程自身消息 + 父链所有祖先线程的消息
   - 按 created_at 排序合并
f. 返回完整的 ReviewCommentDto
```

这样 V2 的线程 DTO 的 messages 数组会包含：
- 本线程上的 agent 回复（从 V1 迁移过来的）
- 父链上 V1 线程的用户原始评论（通过 parent_comment_guid 追溯）

### 3. 后端：消息迁移方法

**文件**: `crates/infra/src/db/repo/review_repo.rs`

新增 `reassign_messages_by_fix_run` 方法：

```rust
pub async fn reassign_messages_by_fix_run(
    &self,
    fix_run_guid: &str,
    from_comment_guids: &[String],
    to_comment_guids: &[String],
) -> Result<()>
```

- 按线程 GUID 一一对应迁移
- 只迁移 `fix_run_guid` 匹配当前 run 的消息
- 其他非 agent 消息（用户后续评论等）留在原线程

### 4. 前端：版本自动切换

**文件**: `apps/web/src/hooks/use-review-context.ts`

**问题**: finalization 后刷新数据，版本不自动切到 V2

**方案**: 用 `useRef` 追踪上次的 `current_revision_guid`，当检测到变化时自动 `setSelectedRevisionGuid(latestGuid)`

```typescript
const prevCurrentRevisionGuidRef = useRef<string | null>(null);

useEffect(() => {
  if (!currentSession) { setSelectedRevisionGuid(null); return; }
  const latestGuid = currentSession.current_revision_guid;
  const prevGuid = prevCurrentRevisionGuidRef.current;
  prevCurrentRevisionGuidRef.current = latestGuid;
  // 检测到新版本产生，自动切换
  if (prevGuid !== null && prevGuid !== latestGuid) {
    setSelectedRevisionGuid(latestGuid);
    return;
  }
  // 正常初始化逻辑
  const nextRevisionGuid = selectedRevisionGuid && ...  ? selectedRevisionGuid : latestGuid;
  if (nextRevisionGuid !== selectedRevisionGuid) {
    setSelectedRevisionGuid(nextRevisionGuid);
  }
}, [currentSession, selectedRevisionGuid]);
```

### 5. 前端：版本选择器

**文件**: `apps/web/src/components/diff/review/ReviewActions.tsx`

引入已有的 `RevisionPicker` 组件，当 session 有多个 revision 时显示版本切换下拉菜单：

```tsx
{(currentSession?.revisions.length ?? 0) > 1 && (
  <RevisionPicker
    revisions={currentSession?.revisions ?? []}
    selectedGuid={currentRevision?.guid ?? null}
    onSelect={setSelectedRevisionGuid}
  />
)}
```

### 6. 前端：Summary 按 Revision 过滤

**文件**: `apps/web/src/hooks/use-review-context.ts`

```typescript
// 之前：session 级别，所有 revision 共享
const latestSummaryRun = useMemo(
  () => currentSession?.runs.find((run) => !!run.summary_rel_path) ?? null,
  [currentSession],
);

// 之后：只匹配当前 revision 产生的 fix run
const latestSummaryRun = useMemo(
  () => {
    if (!currentSession || !currentRevision) return null;
    return currentSession.runs.find((run) =>
      !!run.summary_rel_path && run.result_revision_guid === currentRevision.guid,
    ) ?? null;
  },
  [currentSession, currentRevision],
);
```

### 7. 前端：ReviewView Stats 改为 Revision 级别

**文件**: `apps/web/src/components/diff/ReviewView.tsx`

```typescript
// 之前：使用 session 级别的 open_comment_count
<span>{currentSession.open_comment_count} open</span>
<span>{currentSession.reviewed_file_count}/{fileCount} reviewed</span>

// 之后：使用当前 revision 的 comments 和 files
const openCommentCount = comments.filter((t) => t.status === "open" || t.status === "agent_fixed").length;
<span>{openCommentCount} open</span>
<span>{currentRevision?.files.filter((f) => f.state.reviewed).length ?? 0}/{fileCount} reviewed</span>
<span>{currentRevision?.files.filter((f) => f.changed_after_review).length ?? 0} changed after review</span>
```

### 8. 前端：Summary 直接渲染 Markdown

**文件**: `apps/web/src/components/diff/ReviewView.tsx`

使用项目已有的 `MarkdownRenderer` 组件，自动加载 summary 并渲染：

- 加载后自动 fetch summary 内容（`useEffect` 监听 `latestSummaryRun?.guid`）
- 使用 `MarkdownRenderer` 渲染，而非 plaintext
- 加载中显示 spinner

---

## 数据流示意

### V1 → V2 Finalization 流程

```
┌─────────────────────────────────────────────────────────────┐
│                    finalize_fix_run                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 创建新 revision (V2)                                    │
│  2. 为每个文件创建新 file_snapshot                           │
│  3. 继承 file_state (reviewed 标记)                         │
│  4. 继承 review_comment:                                     │
│     V1 Comment A ──→ V2 Comment A'                            │
│       (parent_comment_guid = A.guid)                         │
│  5. 迁移 agent 消息:                                        │
│     message(fix_run=run1, comment=A) ──→ comment=A'           │
│  6. 更新 session.current_revision_guid = V2                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### V2 线程查询流程

```
V2 Comment A' (parent_comment_guid = A.guid)
  │
  ├─ 自身消息: [agent reply (从 V1 迁移), 用户 V2 评论]
  │
  └─ 父链追溯:
     V1 Comment A (parent_comment_guid = NULL)
       └─ 自身消息: [用户原始评论]

  最终 messages = V2自身 + V1父链, 按 created_at 排序
  = [用户评论, agent回复, 用户新评论]
```

---

## 边界情况

### 文件在新版本中消失

`snapshot_guid_map` 只包含 V1 中存在且 V2 中仍有对应文件的快照。若文件在 V2 中被删除，该文件的线程不会继承到 V2（`snapshot_guid_map.get()` 返回 None 时 continue 跳过）。

V1 中仍有这些线程，用户切换到 V1 时可以正常查看。

### 多版本链 (V1 → V2 → V3)

`resolve_ancestor_comments` 递归解析父链：
- V3 Comment 的 parent 指向 V2 Comment
- V2 Comment 的 parent 指向 V1 Comment
- 查询 V3 Comment 时，消息列表 = V3自身 + V2父 + V1祖先

### Agent 多次 fix

每次 fix run 只迁移当前 run 的 `fix_run_guid` 匹配的消息，不影响之前 run 的消息。

---

## 后续优化（v2 考量）

1. **行号重映射**: 当前继承的 anchor 保留了 V1 的行号，V2 文件内容变化后行号可能偏移。后续可基于 diff 算法自动调整行号
2. **线程状态演进**: 当 V2 继承线程后，V1 原始线程的状态是否应自动标记为某个中间态（如 "superseded"）
3. **UI 展示优化**: 在 CommentCard 中展示 parent 关系（如 "继承自 V1 评论" 标签）
