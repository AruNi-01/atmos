# Slice examples

## 好：契约先行，再并行互斥文件

TECH 已定义 `ChatSessionId` 与 `ws` 动作名，但类型还没进仓库。

| ID | Wave | Owns |
|----|------|------|
| S0 | 0 串行 | `packages/api-types/src/ws/dto/agent-chat.ts`, `contract/agent-chat.ts` |
| S1 | 1 | `crates/agent/src/session/**`, `apps/api/src/api/ws/agent_chat*.rs` |
| S2 | 1 | `apps/web/src/features/agent/lib/**`（不含 `messages/*.json`） |
| S3 | 2 串行 | `apps/web/messages/en.json`, `apps/web/messages/zh.json` |

S1 与 S2 在 S0 落地前不能并行。S3 是 hot file，永远单独一波。

## 坏：按「层」拆却共享同一文件

| 切片 | 错误 Owns |
|------|-----------|
| 「后端」 | `crates/agent/**` |
| 「前端」 | `apps/web/**` |

太宽。`apps/web/**` 含 locale、store、无关 feature。两个 brief 若都提「加一个 WS 字段」，双方都会改 `packages/api-types`。

## 坏：同一模块两支笔

S1 `Owns`: `agent-chat-events.ts`  
S2 `Owns`: `agent-chat-thread.ts` 且 brief 说「顺手把 event union 补上」

S2 会写 S1 的文件 → last-write-wins。把 union 放进 Wave 0，或只让 S1 拥有该文件。

## 好：审查清单是逻辑，不是「看看代码好不好」

主 Agent 给 S2 的清单：

1. 重连后是否按 TECH 用 `resumeToken` 而不是全量 replay
2. 空 transcript 是否走 PRD 的 empty state，而不是 spinner
3. 是否没有改 `Owns` 外的 `AgentChatPanel.tsx`

坏清单：「可读性、命名、是否 React 惯用法」。那会变成风格审查。

## 好：BLOCKED 而不是发明口径

TECH 没写 permission 失败是 `WsEvent` 还是 tool result。实现 Agent 返回：

```text
STATUS: BLOCKED
QUESTION:
A) 新增 WsEvent `agent_permission_denied`（需改 api-types；不在 Owns）
B) 作为 tool result `error` 字段（仅 Owns 内）
缺：TECH §Events 里的一句
```

坏：自己选 B 写完，另一个切片按 A 写客户端。

## 派发形状（父会话，同一条消息里多个 Task）

并行波只派 `Owns` 已通过碰撞检查的切片。每个 Task：

- `subagent_type`: `generalPurpose`
- `model`: `inherit`（HUMAN 点名除外）
- Prompt 含完整 brief +「先读 `impl.md` / `review.md`」
- 不要写「继续我们刚才的讨论」
