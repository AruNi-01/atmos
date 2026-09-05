"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@workspace/ui";
import { ChevronRight, FileText } from "lucide-react";
import { MarkdownCodeBlock } from "@/shared/components/markdown/MarkdownRenderer";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { useOpenAgentChatWorkspacePath } from "@/features/agent/hooks/use-open-agent-chat-path";
import { AgentPartView } from "./AgentPartView";
import { AgentStreamReveal } from "./AgentStreamReveal";
import { AgentToolGroupView } from "./AgentToolGroupView";
import {
  AgentChatMarkdownFileChip,
  AgentChatMarkdownFileLink,
} from "./AgentChatMarkdownFile";
import { useAgentChatCwd, useAgentChatPathRoots } from "./agent-chat-cwd-context";
import {
  hasCollapsibleAssistantProcess,
  shouldAutoCollapseProcessOnSettle,
} from "@/features/agent/lib/assistant-process-parts";
import { AgentWorkedForLabel } from "./AgentWorkedForLabel";
import {
  classifyAgentChatHref,
  resolveAgentChatWorkspaceFile,
} from "@/features/agent/lib/agent-chat-file-links";
import {
  segmentAssistantParts,
  splitSegmentedAssistantParts,
  toolGroupHasRunning,
  type AssistantSegment,
} from "@/features/agent/lib/tool-group";
import { AssistantProcessInspectProvider } from "./assistant-process-inspect-context";

const REVIEW_PATH_RE = /(?:\/[\w.~-]+)*\/\.atmos\/reviews\/[\w./:~-]+\.md/;

function useReviewLinkComponents() {
  const openWorkspacePath = useOpenAgentChatWorkspacePath();
  const cwd = useAgentChatCwd();
  const roots = useAgentChatPathRoots();

  return useMemo(() => {
    const ReviewCode = (props: React.ComponentPropsWithoutRef<"code"> & { node?: unknown }) => {
      const { children, node: _, className, ...rest } = props;
      const text = typeof children === "string" ? children : String(children ?? "");
      const isFence = Boolean(className?.includes("language-") || text.includes("\n"));
      if (!isFence && REVIEW_PATH_RE.test(text)) {
        const file = resolveAgentChatWorkspaceFile(text, cwd, roots);
        if (file) {
          const fileName = text.split("/").pop() || text;
          return (
            <button
              type="button"
              onClick={() => void openWorkspacePath(file.path, { preview: true, isDir: false })}
              className="inline-flex items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[0.85em] text-primary underline decoration-primary/40 underline-offset-2 hover:bg-primary/20 hover:decoration-primary cursor-pointer"
              title={file.path}
            >
              <FileText className="size-3 shrink-0" />
              {fileName}
            </button>
          );
        }
      }
      if (!isFence) {
        const file = resolveAgentChatWorkspaceFile(text, cwd, roots);
        if (file) {
          return (
            <AgentChatMarkdownFileChip
              raw={text}
              path={file.path}
              line={file.line}
              className={className}
            />
          );
        }
      }
      return <MarkdownCodeBlock className={className} {...rest}>{children}</MarkdownCodeBlock>;
    };

    const FileLink = (props: React.ComponentPropsWithoutRef<"a">) => {
      const { href, children, onClick, ...rest } = props;
      const classified = classifyAgentChatHref(href, cwd, roots);
      if (classified.kind === "plain") {
        return <span>{children}</span>;
      }
      if (classified.kind !== "workspace") {
        return (
          <a href={href} onClick={onClick} {...rest}>
            {children}
          </a>
        );
      }
      return (
        <AgentChatMarkdownFileLink file={classified.file} href={href} onClick={onClick} {...rest}>
          {children}
        </AgentChatMarkdownFileLink>
      );
    };

    return { code: ReviewCode, a: FileLink };
  }, [cwd, openWorkspacePath, roots]);
}

function ProcessCollapseRail({
  expanded,
  collapseAria,
  collapseLabel,
}: {
  expanded: boolean;
  collapseAria: string;
  collapseLabel: string;
}) {
  return (
    <CollapsibleTrigger
      aria-label={expanded ? collapseAria : undefined}
      className="flex w-full cursor-pointer items-center gap-2 py-1 text-muted-foreground hover:text-foreground"
    >
      <div className="h-px min-w-0 flex-1 bg-border" />
      {expanded ? (
        <>
          <span className="shrink-0 text-xs leading-none">
            {collapseLabel}
          </span>
          <div className="h-px min-w-0 flex-1 bg-border" />
        </>
      ) : null}
    </CollapsibleTrigger>
  );
}

function toolGroupKey(segment: Extract<AssistantSegment, { type: "tool_group" }>): string {
  return segment.parts[0]?.tool_call_id ?? segment.origIndexes.join("-");
}

export function AssistantMessageView({
  message,
}: {
  message: AgentMessage;
}) {
  const t = useTranslations("Agent.components");
  const reviewComponents = useReviewLinkComponents();
  const parts = message.parts;
  const streaming = Boolean(message.streaming);

  const segments = useMemo(() => segmentAssistantParts(parts), [parts]);
  const { processSegments, answerSegments } = useMemo(
    () => splitSegmentedAssistantParts(segments),
    [segments],
  );

  const canCollapse = hasCollapsibleAssistantProcess(message);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [processMounted, setProcessMounted] = useState(false);
  const [userInspecting, setUserInspecting] = useState(false);
  const [userOpenedGroups, setUserOpenedGroups] = useState<Record<string, boolean>>({});
  const wasCollapsibleRef = useRef(false);
  const markInspecting = useCallback(() => {
    setUserInspecting(true);
  }, []);

  // When the turn first settles into collapsible chrome, auto-collapse unless the user
  // expanded tools/process during the stream.
  if (canCollapse && !wasCollapsibleRef.current) {
    setStepsExpanded(!shouldAutoCollapseProcessOnSettle(userInspecting));
  }
  wasCollapsibleRef.current = canCollapse;

  if (stepsExpanded && !processMounted) {
    setProcessMounted(true);
  }

  const renderPart = (part: AgentPart, i: number) => (
    <AgentPartView
      part={part}
      index={i}
      parts={parts}
      streaming={streaming}
      thinkingMs={message.thinking_ms}
      reviewComponents={reviewComponents}
    />
  );

  const renderSegment = (segment: AssistantSegment, list: AssistantSegment[]) => {
    if (segment.type === "tool_group") {
      const isTail = list[list.length - 1] === segment;
      const key = toolGroupKey(segment);
      return (
        <AgentToolGroupView
          key={key}
          parts={segment.parts}
          autoOpen={streaming && (isTail || toolGroupHasRunning(segment.parts))}
          userOpen={userOpenedGroups[key]}
          onUserOpenChange={(next) => {
            setUserOpenedGroups((prev) => ({ ...prev, [key]: next }));
            if (next) markInspecting();
          }}
        />
      );
    }
    return (
      <AgentStreamReveal key={segment.origIndex} enabled={streaming}>
        {renderPart(segment.part, segment.origIndex)}
      </AgentStreamReveal>
    );
  };

  if (canCollapse) {
    const showWorkedFor = message.worked_ms != null && message.worked_ms > 0;
    return (
      <AssistantProcessInspectProvider onInspect={markInspecting}>
        <Collapsible
          open={stepsExpanded}
          onOpenChange={(next) => {
            setStepsExpanded(next);
            if (next) markInspecting();
          }}
        >
          <CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-1 py-0.5 text-left text-muted-foreground hover:text-foreground">
            {showWorkedFor ? (
              <AgentWorkedForLabel
                workedMs={message.worked_ms ?? 0}
                reveal="duration"
              />
            ) : (
              <span className="text-xs">{t("assistantTurn.process.label")}</span>
            )}
            <ChevronRight
              className={cn(
                "size-3 shrink-0 transition-transform duration-200",
                stepsExpanded ? "rotate-90" : "rotate-0",
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-1">
            {stepsExpanded
              ? processSegments.map((segment) => renderSegment(segment, processSegments))
              : null}
          </CollapsibleContent>
          <ProcessCollapseRail
            expanded={stepsExpanded}
            collapseAria={t("assistantTurn.process.collapseAria")}
            collapseLabel={t("assistantTurn.process.collapseLabel")}
          />
        </Collapsible>
        {answerSegments.map((segment) => renderSegment(segment, answerSegments))}
      </AssistantProcessInspectProvider>
    );
  }

  return (
    <AssistantProcessInspectProvider onInspect={markInspecting}>
      {segments.map((segment) => renderSegment(segment, segments))}
    </AssistantProcessInspectProvider>
  );
}
