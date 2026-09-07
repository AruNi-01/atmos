"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ListTodo, ScrollText } from "lucide-react";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { AgentToolCard, type AgentToolSurface } from "./AgentToolCard";
import { AgentToolTodosBody } from "./AgentToolBodies";
import type { TodoItem } from "@/features/agent/lib/tool-results/parse-tool-result";

const PLAN_MARKDOWN_CLASS =
  "prose prose-sm dark:prose-invert max-w-none px-3 py-2 text-[13px] leading-relaxed prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2 [&_pre]:max-w-full";

type PlanPane = "body" | "todos";

function todosFromPart(part: AgentToolCallPart): TodoItem[] {
  if (part.params?.type !== "plan_document") return [];
  return (part.params.todos ?? [])
    .map((todo) => ({
      content: todo.content?.trim() ?? "",
      status: todo.status?.trim() || "pending",
    }))
    .filter((todo) => todo.content.length > 0);
}

/** Plan-phase createPlan / updatePlan card — not the live PlanBlockView tracker. */
export function AgentToolPlanDocument({
  part,
  surface = "card",
}: {
  part: AgentToolCallPart;
  surface?: AgentToolSurface;
}) {
  const t = useTranslations("Agent.components.toolResults");
  const params = part.params?.type === "plan_document" ? part.params : null;
  const plan = params?.plan?.trim() ?? "";
  const todos = useMemo(() => todosFromPart(part), [part]);
  const title =
    params?.name?.trim()
    || part.title?.trim()
    || t("planDocument");
  const overview = params?.overview?.trim() || null;
  const hasBody = plan.length > 0;
  const hasTodos = todos.length > 0;
  const canSwitch = hasBody && hasTodos;
  const [pane, setPane] = useState<PlanPane>(hasBody ? "body" : "todos");
  const activePane: PlanPane = canSwitch ? pane : hasBody ? "body" : "todos";
  const failed = (part.status ?? "").toLowerCase() === "failed";
  // Completed createPlan should open so the plan markdown is visible without an extra click.
  const defaultOpen = hasBody || hasTodos;

  return (
    <AgentToolCard
      variant="tool"
      surface={surface}
      body="plain"
      tone={failed ? "error" : "default"}
      icon={<ScrollText className="size-4" />}
      title={title}
      status={part.status}
      defaultOpen={defaultOpen}
      actions={
        canSwitch ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            onClick={() => setPane((current) => (current === "body" ? "todos" : "body"))}
          >
            {activePane === "body" ? (
              <>
                <ListTodo className="size-3" />
                {t("planTodos", { count: todos.length })}
              </>
            ) : (
              <>
                <ScrollText className="size-3" />
                {t("planBody")}
              </>
            )}
          </button>
        ) : null
      }
    >
      {overview ? (
        <p className="px-3 pt-2 text-[12px] text-muted-foreground">{overview}</p>
      ) : null}
      {activePane === "body" && hasBody ? (
        <div className={PLAN_MARKDOWN_CLASS} data-agent-plan-document="">
          <MarkdownRenderer>{plan}</MarkdownRenderer>
        </div>
      ) : null}
      {activePane === "todos" && hasTodos ? <AgentToolTodosBody todos={todos} /> : null}
      {!hasBody && !hasTodos ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">{t("noOutput")}</p>
      ) : null}
    </AgentToolCard>
  );
}
