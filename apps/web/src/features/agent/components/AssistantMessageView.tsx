"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  TextMorph,
} from "@workspace/ui";
import { ChevronRight, FileText } from "lucide-react";
import { activateCenterChromeTab } from "@/app-shell/center-stage-activate";
import { useCenterPaintContextId } from "@/app-shell/center-space/use-center-paint-context-id";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { MarkdownCodeBlock } from "@/shared/components/markdown/MarkdownRenderer";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { AgentPartView } from "./AgentPartView";
import { AgentStreamReveal } from "./AgentStreamReveal";
import { AgentToolGroupView } from "./AgentToolGroupView";
import { AgentToolFileChip } from "./tool-results/AgentToolCard";
import { useAgentChatCwd, useAgentChatPathRoots } from "./agent-chat-cwd-context";
import { shouldCollapseAssistantProcess } from "@/features/agent/lib/assistant-process-parts";
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

const REVIEW_PATH_RE = /(?:\/[\w.~-]+)*\/\.atmos\/reviews\/[\w./:~-]+\.md/;

function useReviewLinkComponents() {
  const openFile = useEditorStore(s => s.openFile);
  const paintContextId = useCenterPaintContextId();
  const cwd = useAgentChatCwd();
  const roots = useAgentChatPathRoots();

  return useMemo(() => {
    const handleOpen = (path: string, options?: { preview?: boolean; line?: number }) => {
      if (!paintContextId) return;
      void openFile(path, paintContextId, {
        preview: options?.preview ?? false,
        line: options?.line,
      });
      activateCenterChromeTab(paintContextId, path, { placement: "focused" });
    };

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
              onClick={() => handleOpen(file.path, { preview: true })}
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
          return <AgentToolFileChip path={file.path} line={file.line} />;
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
      const file = classified.file;
      return (
        <a
          {...rest}
          href={href}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleOpen(file.path, { line: file.line });
          }}
          className="cursor-pointer underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
          title={file.path}
        >
          {children}
        </a>
      );
    };

    return { code: ReviewCode, a: FileLink };
  }, [cwd, openFile, paintContextId, roots]);
}

function ProcessDivider({
  expanded,
  t,
}: {
  expanded: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex w-full items-center gap-2 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <TextMorph as="span" className="text-xs leading-none">
          {expanded ? t("assistantTurn.process.hide") : t("assistantTurn.process.show")}
        </TextMorph>
        <ChevronRight className={`size-3 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function AssistantMessageView({
  message,
  registryId,
}: {
  message: AgentMessage;
  registryId: string;
}) {
  const t = useTranslations("Agent.components");
  const reviewComponents = useReviewLinkComponents();
  const parts = message.parts;
  const streaming = Boolean(message.streaming);

  const hasRunningTool = useMemo(
    () => parts.some((part) => part.type === "tool_call" && part.status?.toLowerCase() === "running"),
    [parts],
  );

  const segments = useMemo(() => segmentAssistantParts(parts), [parts]);
  const { processSegments, answerSegments } = useMemo(
    () => splitSegmentedAssistantParts(segments),
    [segments],
  );

  const canCollapse = shouldCollapseAssistantProcess(
    message,
    hasRunningTool,
    processSegments.length > 0,
    answerSegments.length > 0,
  );
  const [stepsExpanded, setStepsExpanded] = useState(false);

  const renderPart = (part: AgentPart, i: number) => (
    <AgentPartView
      part={part}
      index={i}
      parts={parts}
      streaming={streaming}
      thinkingMs={message.thinking_ms}
      registryId={registryId}
      reviewComponents={reviewComponents}
    />
  );

  const renderSegment = (segment: AssistantSegment, list: AssistantSegment[]) => {
    if (segment.type === "tool_group") {
      const isTail = list[list.length - 1] === segment;
      const key = segment.parts[0]?.tool_call_id ?? segment.origIndexes.join("-");
      return (
        <AgentStreamReveal key={key} enabled={streaming}>
          <AgentToolGroupView
            parts={segment.parts}
            autoOpen={streaming && (isTail || toolGroupHasRunning(segment.parts))}
            registryId={registryId}
          />
        </AgentStreamReveal>
      );
    }
    const isProcess = segment.part.type !== "text";
    const content = renderPart(segment.part, segment.origIndex);
    if (!isProcess) {
      return <React.Fragment key={segment.origIndex}>{content}</React.Fragment>;
    }
    return (
      <AgentStreamReveal key={segment.origIndex} enabled={streaming}>
        {content}
      </AgentStreamReveal>
    );
  };

  if (canCollapse) {
    return (
      <>
        <Collapsible open={stepsExpanded} onOpenChange={setStepsExpanded}>
          <CollapsibleTrigger className="w-full cursor-pointer hover:text-foreground">
            <ProcessDivider expanded={stepsExpanded} t={t} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-1">
            {processSegments.map((segment) => renderSegment(segment, processSegments))}
            <CollapsibleTrigger
              aria-label={t("assistantTurn.process.collapseAria")}
              className="flex w-full cursor-pointer items-center gap-2 py-1 text-muted-foreground hover:text-foreground"
            >
              <div className="h-px flex-1 bg-border" />
              <span className="shrink-0 text-xs leading-none">{t("assistantTurn.process.collapseLabel")}</span>
              <div className="h-px flex-1 bg-border" />
            </CollapsibleTrigger>
          </CollapsibleContent>
        </Collapsible>
        {answerSegments.map((segment) => renderSegment(segment, answerSegments))}
      </>
    );
  }

  return (
    <>
      {segments.map((segment) => renderSegment(segment, segments))}
    </>
  );
}
