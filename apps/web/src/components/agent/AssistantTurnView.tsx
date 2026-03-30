"use client";

import React, { useMemo, useState } from "react";
import {
  MessageResponse,
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  TextMorph,
} from "@workspace/ui";
import { ChevronRight, FileText } from "lucide-react";
import { useContextParams } from "@/hooks/use-context-params";
import { useEditorStore } from "@/hooks/use-editor-store";
import { MarkdownCodeBlock } from "@/components/markdown/MarkdownRenderer";
import { resolveAgentVendor } from "@/lib/agent/agent-vendor";
import { normalizeSubAgent } from "@/lib/agent/subagent";
import {
  isPlanUpdateToolCall,
  isSwitchModePlanToolCall,
  type AssistantBlock,
  type AssistantEntry,
  type ToolCallBlock,
} from "@/lib/agent/thread";
import { SubAgentBlockView } from "./SubAgentBlockView";
import { ToolOrSkillBlock } from "./ToolOrSkillBlock";

const REVIEW_PATH_RE = /(?:\/[\w.~-]+)*\/\.atmos\/reviews\/[\w./:~-]+\.md/;

function useReviewLinkComponents() {
  const openFile = useEditorStore(s => s.openFile);
  const { effectiveContextId } = useContextParams();

  return useMemo(() => {
    const handleOpen = (path: string) => {
      void openFile(path, effectiveContextId || undefined, { preview: true });
    };

    const ReviewCode = (props: React.ComponentPropsWithoutRef<"code"> & { node?: unknown }) => {
      const { children, node: _, ...rest } = props;
      const text = typeof children === "string" ? children : String(children ?? "");
      if (REVIEW_PATH_RE.test(text)) {
        const fileName = text.split("/").pop() || text;
        return (
          <button
            type="button"
            onClick={() => handleOpen(text)}
            className="inline-flex items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[0.85em] text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:bg-primary/20 hover:decoration-primary cursor-pointer"
            title={text}
          >
            <FileText className="size-3 shrink-0" />
            {fileName}
          </button>
        );
      }
      return <MarkdownCodeBlock {...rest}>{children}</MarkdownCodeBlock>;
    };

    return { code: ReviewCode };
  }, [openFile, effectiveContextId]);
}

function isBlockHidden(
  block: AssistantBlock,
  vendor: string,
  claudeSubAgentParentIds: Set<string>,
): boolean {
  if (block.type === "plan") return true;
  if (block.type === "tool_call" && isPlanUpdateToolCall(block)) return true;
  if (block.type === "tool_call" && isSwitchModePlanToolCall(block)) return true;
  if (
    block.type === "tool_call" &&
    vendor === "claude" &&
    block.parent_tool_call_id &&
    claudeSubAgentParentIds.has(block.parent_tool_call_id) &&
    block.tool.toLowerCase() !== "think" &&
    block.tool.toLowerCase() !== "thought"
  ) return true;
  if (block.type === "text" && !block.content) return true;
  if (block.type === "thinking" && !block.content) return true;
  return false;
}

function ProcessDivider({ expanded }: { expanded: boolean }) {
  return (
    <div className="flex w-full items-center gap-2 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <TextMorph as="span" className="text-xs leading-none">
          {expanded ? "Hide" : "Show"}
        </TextMorph>
        {" process"}
        <ChevronRight className={`size-3 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function AssistantTurnView({
  entry,
  registryId,
}: {
  entry: AssistantEntry;
  registryId: string;
}) {
  const reviewComponents = useReviewLinkComponents();
  const vendor = resolveAgentVendor(registryId);
  const claudeChildToolCallsByParentId = useMemo(() =>
    vendor === "claude"
      ? entry.blocks.reduce((map, candidate) => {
        if (candidate.type !== "tool_call" || !candidate.parent_tool_call_id) return map;
        const siblings = map.get(candidate.parent_tool_call_id) ?? [];
        siblings.push(candidate);
        map.set(candidate.parent_tool_call_id, siblings);
        return map;
      }, new Map<string, ToolCallBlock[]>())
      : new Map<string, ToolCallBlock[]>(),
    [vendor, entry.blocks],
  );
  const claudeSubAgentParentIds = useMemo(() =>
    vendor === "claude"
      ? new Set(
        entry.blocks.flatMap((candidate) => {
          if (candidate.type !== "tool_call") return [];
          const childToolCalls = claudeChildToolCallsByParentId.get(candidate.tool_call_id) ?? [];
          return normalizeSubAgent(candidate, registryId, childToolCalls)
            ? [candidate.tool_call_id]
            : [];
        }),
      )
      : new Set<string>(),
    [vendor, entry.blocks, claudeChildToolCallsByParentId, registryId],
  );

  const lastVisibleTextIndex = useMemo(() => {
    for (let i = entry.blocks.length - 1; i >= 0; i--) {
      const block = entry.blocks[i];
      if (block.type === "text" && block.content) return i;
    }
    return -1;
  }, [entry.blocks]);

  const isStreamingFinalText = entry.isStreaming === true
    && lastVisibleTextIndex >= 0
    && !entry.blocks.slice(lastVisibleTextIndex + 1).some(b => b.type === "text");

  const canCollapse = lastVisibleTextIndex >= 0 && (!entry.isStreaming || isStreamingFinalText);

  const intermediateBlocks = useMemo(() => {
    if (!canCollapse) return [];
    const result: { block: AssistantBlock; origIndex: number }[] = [];
    for (let i = 0; i < lastVisibleTextIndex; i++) {
      const b = entry.blocks[i];
      if (!isBlockHidden(b, vendor, claudeSubAgentParentIds)) result.push({ block: b, origIndex: i });
    }
    return result;
  }, [canCollapse, entry.blocks, lastVisibleTextIndex, vendor, claudeSubAgentParentIds]);

  const trailingBlocks = useMemo(() => {
    if (!canCollapse) return [];
    const result: { block: AssistantBlock; origIndex: number }[] = [];
    for (let i = lastVisibleTextIndex + 1; i < entry.blocks.length; i++) {
      const b = entry.blocks[i];
      if (!isBlockHidden(b, vendor, claudeSubAgentParentIds)) result.push({ block: b, origIndex: i });
    }
    return result;
  }, [canCollapse, entry.blocks, lastVisibleTextIndex, vendor, claudeSubAgentParentIds]);

  const hasCollapsibleContent = intermediateBlocks.length > 0 || trailingBlocks.length > 0;
  const [stepsExpanded, setStepsExpanded] = useState(false);

  const renderBlock = (block: AssistantBlock, i: number) => {
    if (isBlockHidden(block, vendor, claudeSubAgentParentIds)) return null;

    if (block.type === "text") {
      const isLastTextBlock =
        entry.isStreaming &&
        !entry.blocks.slice(i + 1).some((b) => b.type === "text");
      return (
        <MessageResponse
          key={i}
          parseIncompleteMarkdown
          animated={isLastTextBlock}
          caret={isLastTextBlock ? "block" : undefined}
          className="break-words"
          components={reviewComponents}
        >
          {block.content}
        </MessageResponse>
      );
    }
    if (
      block.type === "thinking" ||
      (block.type === "tool_call" &&
        (block.tool.toLowerCase() === "think" ||
          block.tool.toLowerCase() === "thought"))
    ) {
      const content =
        block.type === "thinking"
          ? block.content
          : typeof block.raw_output === "string" && block.raw_output
            ? block.raw_output
            : typeof block.raw_input === "string" && block.raw_input
              ? block.raw_input
              : block.raw_input &&
                typeof block.raw_input === "object" &&
                (block.raw_input as Record<string, unknown>).thought
                ? (block.raw_input as Record<string, unknown>).thought
                : block.description;

      const isCurrentlyThinking =
        (block.type === "thinking" &&
          entry.isStreaming &&
          i === entry.blocks.length - 1) ||
        (block.type === "tool_call" && block.status === "running");

      return (
        <Reasoning
          key={block.type === "thinking" ? `thinking-${i}` : block.tool_call_id || i}
          isStreaming={isCurrentlyThinking}
          defaultOpen={isCurrentlyThinking}
        >
          <ReasoningTrigger />
          <ReasoningContent className="break-words prose-sm dark:prose-invert max-w-full overflow-hidden">{String(content || "")}</ReasoningContent>
        </Reasoning>
      );
    }

    if (block.type === "tool_call") {
      const childToolCalls = vendor === "claude"
        ? (claudeChildToolCallsByParentId.get(block.tool_call_id) ?? [])
        : [];
      const subAgent = normalizeSubAgent(block, registryId, childToolCalls);
      if (subAgent) {
        return <SubAgentBlockView key={block.tool_call_id || i} message={subAgent} />;
      }
    }

    return (
      <ToolOrSkillBlock key={(block as ToolCallBlock).tool_call_id || i} {...block as ToolCallBlock} />
    );
  };

  if (canCollapse && hasCollapsibleContent) {
    return (
      <>
        <Collapsible open={stepsExpanded} onOpenChange={setStepsExpanded}>
          <CollapsibleTrigger className="w-full cursor-pointer transition-colors hover:text-foreground">
            <ProcessDivider expanded={stepsExpanded} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-1">
            {intermediateBlocks.map(({ block, origIndex }) => (
              <React.Fragment key={origIndex}>{renderBlock(block, origIndex)}</React.Fragment>
            ))}
            {trailingBlocks.map(({ block, origIndex }) => (
              <React.Fragment key={origIndex}>{renderBlock(block, origIndex)}</React.Fragment>
            ))}
            <div className="flex w-full items-center gap-2 py-1">
              <div className="h-px flex-1 bg-border" />
              <span className="shrink-0 text-xs text-muted-foreground">Process end</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {renderBlock(entry.blocks[lastVisibleTextIndex], lastVisibleTextIndex)}
      </>
    );
  }

  return (
    <>
      {entry.blocks.map((block, i) => renderBlock(block, i))}
    </>
  );
}
