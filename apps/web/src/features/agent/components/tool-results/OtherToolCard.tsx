"use client";

import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { otherToolBodies } from "@/features/agent/lib/tool-results/parse-tool-result";
import { getToolKindIcon } from "@/features/agent/lib/chat-helpers";
import { useDisplayToolTitle } from "../agent-chat-cwd-context";
import { AgentToolCard, type AgentToolSurface } from "./AgentToolCard";
import {
  AgentToolEmptyBody,
  AgentToolErrorBody,
  AgentToolJsonBody,
  AgentToolTextBody,
} from "./AgentToolBodies";

export function OtherToolCard({
  part,
  surface = "card",
}: {
  part: AgentToolCallPart;
  surface?: AgentToolSurface;
}) {
  const displayTitle = useDisplayToolTitle();
  const rawTitle = (part.title || part.name).trim() || "Tool";
  const title = displayTitle(rawTitle);
  const { paramsJson, resultBody } = otherToolBodies(part);
  const failed = (part.status ?? "").toLowerCase() === "failed" || resultBody?.kind === "error";

  return (
    <AgentToolCard
      variant="tool"
      surface={surface}
      body="panel"
      tone={failed ? "error" : "default"}
      icon={getToolKindIcon("other")}
      title={title}
      titleTooltip={rawTitle}
      status={part.status ?? undefined}
    >
      {paramsJson ? <AgentToolJsonBody json={paramsJson} /> : null}
      {resultBody?.kind === "json" ? <AgentToolJsonBody json={resultBody.value} /> : null}
      {resultBody?.kind === "text" ? <AgentToolTextBody text={resultBody.value} /> : null}
      {resultBody?.kind === "error" ? <AgentToolErrorBody text={resultBody.value} /> : null}
      {!paramsJson && !resultBody ? <AgentToolEmptyBody status={part.status ?? undefined} /> : null}
    </AgentToolCard>
  );
}
