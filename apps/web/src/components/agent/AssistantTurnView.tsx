"use client";

import React, { useMemo } from "react";
import {
  MessageResponse,
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@workspace/ui";
import { FileText } from "lucide-react";
import { useContextParams } from "@/hooks/use-context-params";
import { useEditorStore } from "@/hooks/use-editor-store";
import { MarkdownCodeBlock } from "@/components/markdown/MarkdownRenderer";
import { resolveAgentVendor } from "@/lib/agent/agent-vendor";
import { normalizeSubAgent } from "@/lib/agent/subagent";
import {
  isPlanUpdateToolCall,
  isSwitchModePlanToolCall,
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

export function AssistantTurnView({
  entry,
  registryId,
}: {
  entry: AssistantEntry;
  registryId: string;
}) {
  const reviewComponents = useReviewLinkComponents();
  const vendor = resolveAgentVendor(registryId);
  const claudeChildToolCallsByParentId = vendor === "claude"
    ? entry.blocks.reduce((map, candidate) => {
      if (candidate.type !== "tool_call" || !candidate.parent_tool_call_id) return map;
      const siblings = map.get(candidate.parent_tool_call_id) ?? [];
      siblings.push(candidate);
      map.set(candidate.parent_tool_call_id, siblings);
      return map;
    }, new Map<string, ToolCallBlock[]>())
    : new Map<string, ToolCallBlock[]>();
  const claudeSubAgentParentIds = vendor === "claude"
    ? new Set(
      entry.blocks.flatMap((candidate) => {
        if (candidate.type !== "tool_call") return [];
        const childToolCalls = claudeChildToolCallsByParentId.get(candidate.tool_call_id) ?? [];
        return normalizeSubAgent(candidate, registryId, childToolCalls)
          ? [candidate.tool_call_id]
          : [];
      }),
    )
    : new Set<string>();

  return (
    <>
      {entry.blocks.map((block, i) => {
        if (block.type === "text") {
          if (!block.content) return null;
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

          if (!content && block.type === "thinking") return null;

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
        if (block.type === "plan") return null;

        if (block.type === "tool_call" && isPlanUpdateToolCall(block)) return null;
        if (block.type === "tool_call" && isSwitchModePlanToolCall(block)) return null;
        if (
          block.type === "tool_call" &&
          vendor === "claude" &&
          block.parent_tool_call_id &&
          claudeSubAgentParentIds.has(block.parent_tool_call_id)
        ) {
          return null;
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
          <ToolOrSkillBlock key={block.tool_call_id || i} {...block as ToolCallBlock} />
        );
      })}
    </>
  );
}
