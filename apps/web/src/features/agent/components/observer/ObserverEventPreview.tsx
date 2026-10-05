"use client";

import type {
  AgentPart,
  AgentToolKind,
  AgentToolParams,
  AgentToolResult,
  AgentToolStatus,
} from "@atmos/api-types/ws/dto/agent-chat";
import type {
  AgentActivity,
  AgentChildActivity,
  AgentToolLine,
  AgentTurn,
} from "@atmos/api-types/ws/dto/events";
import { Message, MessageContent, MessageResponse } from "@workspace/ui";
import { isLeakedChildTurn } from "@/features/agent/lib/observer-conversation";
import { collectTurnFileChanges } from "@/features/agent/lib/tool-results/turn-file-changes";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { SubAgentBlockView } from "@/features/agent/components/SubAgentBlockView";
import { SubagentOverlayProvider } from "@/features/agent/components/subagent-overlay-context";
import { UserMessageBody } from "@/features/agent/components/UserMessageBody";
import { ToolView } from "@/features/agent/components/ToolView";

const TOOL_KINDS = new Set<AgentToolKind>([
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "web_search",
  "execute",
  "fetch",
  "skill",
  "subagent",
  "mcp_list",
  "mcp_call",
  "image_gen",
  "plan_document",
  "other",
]);

function toolKind(kind: string | null | undefined): AgentToolKind {
  if (kind && TOOL_KINDS.has(kind as AgentToolKind)) return kind as AgentToolKind;
  return "other";
}

function toolStatus(state: string): AgentToolStatus {
  const value = state.trim().toLowerCase();
  if (value === "error" || value === "failed") return "failed";
  if (value === "pending" || value === "running" || value === "in_progress") return "running";
  return "completed";
}

function paramsFor(kind: AgentToolKind, line: AgentToolLine): AgentToolParams {
  const path = line.path?.trim() || "";
  const detail = line.detail.trim();
  switch (kind) {
    case "read":
      return { type: "read", path };
    case "edit":
      return { type: "edit", path };
    case "delete":
      return { type: "delete", path };
    case "move":
      return { type: "move", from: path, to: path };
    case "search":
      return { type: "search", query: detail || line.name };
    case "web_search":
      return { type: "web_search", query: detail || line.name };
    case "execute":
      return { type: "execute", command: detail || line.name, background: false };
    case "fetch":
      return { type: "fetch", url: detail };
    case "skill":
      return { type: "skill", skill: detail || line.name };
    case "subagent":
      return { type: "subagent", description: detail || line.name };
    case "mcp_list":
      return { type: "mcp_list" };
    case "mcp_call":
      return { type: "mcp_call" };
    case "image_gen":
      return { type: "image_gen", prompt: detail || line.name };
    case "plan_document":
      return { type: "plan_document", plan: detail, todos: [] };
    default:
      return { type: "other", value: detail ? { detail } : {} };
  }
}

function resultFor(line: AgentToolLine): AgentToolResult | undefined {
  if (line.old_content != null || line.new_content != null) {
    return {
      type: "diff",
      path: line.path?.trim() || "",
      old_content: line.old_content ?? "",
      new_content: line.new_content ?? "",
    };
  }
  if (line.diff && line.diff.trim()) return { type: "text", text: line.diff };
  if (!line.output) return undefined;
  if (line.kind === "execute") return { type: "execute", output: line.output };
  if (line.state === "error" || line.state === "failed") return { type: "error", message: line.output };
  return { type: "text", text: line.output };
}

function lineToPart(line: AgentToolLine, id: string): AgentPart {
  const kind = toolKind(line.kind);
  return {
    type: "tool_call",
    tool_call_id: id,
    name: line.name,
    kind,
    status: toolStatus(line.state),
    params: paramsFor(kind, line),
    result: resultFor(line),
  };
}

function sameLine(left: AgentToolLine, right: AgentToolLine): boolean {
  return left.name === right.name && left.state === right.state && left.started_at === right.started_at;
}

function withCurrent(lines: AgentToolLine[], current: AgentToolLine | null | undefined): AgentToolLine[] {
  if (!current || lines.some((line) => sameLine(line, current))) return lines;
  return [...lines, current];
}

function visibleTurns(activity: AgentActivity): AgentTurn[] {
  const children = activity.children ?? [];
  return (activity.turns ?? []).filter((turn) => !isLeakedChildTurn(turn, children));
}

function childrenForTurn(
  turn: AgentTurn,
  children: AgentChildActivity[],
  turns: AgentTurn[],
  isLatest: boolean,
): AgentChildActivity[] {
  const spawned = new Set(turn.spawned_child_ids ?? []);
  const claimed = new Set(turns.flatMap((item) => item.spawned_child_ids ?? []));
  return rootChildren(children).filter((child) => {
    if (spawned.has(child.child_id)) return true;
    return isLatest && !claimed.has(child.child_id);
  });
}

function childLines(child: AgentChildActivity): AgentToolLine[] {
  return withCurrent(child.recent_tools ?? [], child.current_tool);
}

function rootChildren(children: AgentChildActivity[]): AgentChildActivity[] {
  const ids = new Set(children.map((child) => child.child_id));
  return children.filter((child) => {
    const parent = child.parent_child_id?.trim();
    return !parent || parent === child.child_id || !ids.has(parent);
  });
}

function kidsOf(children: AgentChildActivity[], parentId: string): AgentChildActivity[] {
  return children.filter((child) => child.parent_child_id === parentId && child.child_id !== parentId);
}

function childSettled(child: AgentChildActivity): boolean {
  return child.state !== "running" && child.state !== "permission_request";
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function defaultFilesLabel(count: number): string {
  return count === 1 ? "1 file changed" : `${count} files changed`;
}

function FilesCard({
  parts,
  filesLabel,
}: {
  parts: AgentPart[];
  filesLabel: (count: number) => string;
}) {
  const changes = collectTurnFileChanges(parts, { includeRanges: false });
  if (changes.length === 0) return null;
  return (
    <div
      data-observer-files=""
      className="mt-3 w-full min-w-0 rounded-xl border border-border bg-muted/40 px-3 py-2.5"
    >
      <p className="pb-1 text-sm text-muted-foreground">{filesLabel(changes.length)}</p>
      <ul className="flex flex-col">
        {changes.map((change) => (
          <li
            key={change.path}
            data-observer-file={change.path}
            data-observer-additions={change.additions}
            data-observer-deletions={change.deletions}
            className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm"
          >
            <span className="min-w-0 flex-1 truncate text-foreground">{fileName(change.path)}</span>
            <span className="shrink-0 font-mono text-xs">
              {change.additions > 0 ? <span className="text-green-500">+{change.additions}</span> : null}
              {change.additions > 0 && change.deletions > 0 ? " " : null}
              {change.deletions > 0 ? <span className="text-red-500">-{change.deletions}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function toolPart(line: AgentToolLine, id: string): AgentToolCallPart | null {
  const part = lineToPart(line, id);
  return part.type === "tool_call" ? part : null;
}

function visibleLines(lines: AgentToolLine[]): AgentToolLine[] {
  return lines.filter((line) => toolKind(line.kind) !== "subagent");
}

function PromptBubble({ text }: { text: string }) {
  return (
    <Message from="user" data-observer-prompt="" className="mb-2 gap-0">
      <MessageContent rounded="2xl">
        <UserMessageBody text={text} />
      </MessageContent>
    </Message>
  );
}

function ReplyText({ text }: { text: string }) {
  return (
    <Message from="assistant" data-observer-reply="" className="mt-2">
      <MessageContent>
        <MessageResponse className="break-words">{text}</MessageResponse>
      </MessageContent>
    </Message>
  );
}

function ObserverTool({ line, id }: { line: AgentToolLine; id: string }) {
  const part = toolPart(line, id);
  if (!part) return null;
  return (
    <div data-observer-tool={line.name} data-observer-tool-name={line.name}>
      <ToolView part={part} defaultOpen={false} />
    </div>
  );
}

function childRowPart(child: AgentChildActivity): AgentToolCallPart {
  const description =
    child.description?.trim() ||
    child.name?.trim() ||
    child.agent_type?.trim() ||
    child.child_id;
  const active = child.state === "running" || child.state === "permission_request";
  return {
    type: "tool_call",
    tool_call_id: child.child_id,
    name: "subagent",
    kind: "subagent",
    status: active ? "running" : "completed",
    params: {
      type: "subagent",
      description,
      agent_type: child.agent_type?.trim() || null,
    },
  };
}

function NestedSubagentRow({ child }: { child: AgentChildActivity }) {
  return (
    <div data-observer-nested-subagent={child.child_id} className="mt-1">
      <SubAgentBlockView part={childRowPart(child)} />
    </div>
  );
}

function bodyVisible(
  prompt: string | null | undefined,
  reply: string | null | undefined,
  lines: AgentToolLine[],
  nested: AgentChildActivity[],
): boolean {
  return lines.length > 0 || nested.length > 0 || Boolean(prompt?.trim()) || Boolean(reply?.trim());
}

function TurnBody({
  scope,
  prompt,
  reply,
  lines,
  nested,
  ended,
  filesLabel,
}: {
  scope: string;
  prompt?: string | null;
  reply?: string | null;
  lines: AgentToolLine[];
  nested: AgentChildActivity[];
  ended: boolean;
  filesLabel: (count: number) => string;
}) {
  const text = prompt?.trim();
  const answer = reply?.trim();
  const parts = lines.map((line, index) => lineToPart(line, `${scope}:${index}`));
  if (lines.length === 0 && nested.length === 0 && !text && !answer) return null;
  return (
    <>
      {text ? <PromptBubble text={text} /> : null}
      {lines.map((line, index) => (
        <ObserverTool key={`${scope}:${index}`} line={line} id={`${scope}:${index}`} />
      ))}
      {nested.map((child) => (
        <NestedSubagentRow key={child.child_id} child={child} />
      ))}
      {answer ? <ReplyText text={answer} /> : null}
      {ended ? <FilesCard parts={parts} filesLabel={filesLabel} /> : null}
    </>
  );
}

export function ObserverEventPreview({
  activity,
  childId,
  turnIds,
  filesLabel = defaultFilesLabel,
  emptyLabel,
  onOpenChild,
}: {
  activity: AgentActivity;
  /** When set, preview this child instead of the lead turns. */
  childId?: string;
  /** Lead turns to draw. Omit to draw every kept turn. */
  turnIds?: number[];
  filesLabel?: (count: number) => string;
  showDiffLabel?: string;
  hideDiffLabel?: string;
  emptyLabel?: string;
  /** Open that subagent's drawer. The row stays a chat-style link. */
  onOpenChild?: (childId: string) => void;
}) {
  const children = activity.children ?? [];
  const focus = childId ? children.find((child) => child.child_id === childId) : undefined;
  if (childId && !focus) {
    return emptyLabel ? <p className="px-1 text-sm text-muted-foreground">{emptyLabel}</p> : null;
  }

  const turns = visibleTurns(activity);
  const shown = turnIds ? turns.filter((turn) => turnIds.includes(turn.turn_id)) : turns;
  const latestId = turns.at(-1)?.turn_id;
  const focusLines = focus ? visibleLines(childLines(focus)) : [];
  const focusNested = focus ? kidsOf(children, focus.child_id) : [];
  const shownBodies = focus
    ? []
    : shown.flatMap((turn) => {
      const lines = visibleLines(withCurrent(
        turn.tools ?? [],
        activity.current_turn_id === turn.turn_id ? activity.current_tool : undefined,
      ));
      const nested = childrenForTurn(turn, children, turns, turn.turn_id === latestId);
      if (!bodyVisible(turn.prompt, turn.reply, lines, nested)) return [];
      return [{ turn, lines, nested }];
    });
  const hasBody = focus
    ? bodyVisible(focus.prompt, focus.reply, focusLines, focusNested)
    : shownBodies.length > 0;
  if (!hasBody) {
    return emptyLabel ? <p className="px-1 text-sm text-muted-foreground">{emptyLabel}</p> : null;
  }

  return (
    <SubagentOverlayProvider
      selectedId={null}
      onSelect={(id) => {
        if (id) onOpenChild?.(id);
      }}
    >
      <div
        data-observer-scroll=""
        className="flex h-full min-h-0 w-full min-w-0 flex-col gap-4 overflow-y-auto px-1"
      >
        {focus ? (
          <TurnBody
            scope={focus.child_id}
            prompt={focus.prompt}
            reply={focus.reply}
            lines={focusLines}
            nested={focusNested}
            ended={childSettled(focus)}
            filesLabel={filesLabel}
          />
        ) : (
          shownBodies.map((body) => (
            <div key={body.turn.turn_id} data-observer-turn={body.turn.turn_id} className="flex flex-col gap-1">
              <TurnBody
                scope={`turn:${body.turn.turn_id}`}
                prompt={body.turn.prompt}
                reply={body.turn.reply}
                lines={body.lines}
                nested={body.nested}
                ended={Boolean(body.turn.ended_at)}
                filesLabel={filesLabel}
              />
            </div>
          ))
        )}
      </div>
    </SubagentOverlayProvider>
  );
}
