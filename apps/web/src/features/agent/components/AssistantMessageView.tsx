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
import { splitAssistantProcessParts } from "@/features/agent/lib/assistant-process-parts";

const REVIEW_PATH_RE = /(?:\/[\w.~-]+)*\/\.atmos\/reviews\/[\w./:~-]+\.md/;

function useReviewLinkComponents() {
  const openFile = useEditorStore(s => s.openFile);
  const paintContextId = useCenterPaintContextId();

  return useMemo(() => {
    const handleOpen = (path: string) => {
      if (!paintContextId) return;
      void openFile(path, paintContextId, { preview: true });
      activateCenterChromeTab(paintContextId, path, { placement: "focused" });
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
            className="inline-flex items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[0.85em] text-primary underline decoration-primary/40 underline-offset-2 hover:bg-primary/20 hover:decoration-primary cursor-pointer"
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
  }, [openFile, paintContextId]);
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

  const { processParts, answerParts } = useMemo(
    () => splitAssistantProcessParts(parts),
    [parts],
  );

  const canCollapse =
    !streaming &&
    !hasRunningTool &&
    processParts.length > 0 &&
    answerParts.length > 0;
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

  if (canCollapse) {
    return (
      <>
        <Collapsible open={stepsExpanded} onOpenChange={setStepsExpanded}>
          <CollapsibleTrigger className="w-full cursor-pointer hover:text-foreground">
            <ProcessDivider expanded={stepsExpanded} t={t} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-1">
            {processParts.map(({ part, origIndex }) => (
              <React.Fragment key={origIndex}>{renderPart(part, origIndex)}</React.Fragment>
            ))}
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
        {answerParts.map(({ part, origIndex }) => (
          <React.Fragment key={origIndex}>{renderPart(part, origIndex)}</React.Fragment>
        ))}
      </>
    );
  }

  const orderedParts = [...processParts, ...answerParts];
  return (
    <>
      {orderedParts.map(({ part, origIndex }) => (
        <React.Fragment key={origIndex}>{renderPart(part, origIndex)}</React.Fragment>
      ))}
    </>
  );
}
