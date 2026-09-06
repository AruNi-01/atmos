"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ApprovalCard,
  type ApprovalAction,
  type ApprovalQuestion,
} from "@workspace/ui";
import type {
  AgentChatPermissionOption,
  AgentPlan,
} from "@/features/agent/lib/agent-chat-types";
import type { PendingPermission } from "@/features/agent/lib/chat-helpers";
import {
  permissionDescriptionToRender,
  resolvePermissionCommand,
} from "@/features/agent/lib/agent-permission-content";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import {
  findRecentPlanFilePath,
  parsePlanOverviewFromMarkdown,
} from "@/features/agent/lib/plan-overview";
import { composerFileUrlFromPath } from "@/features/agent/lib/agent-composer-attachment";
import { getRuntimeApiConfig, httpBase } from "@/shared/lib/desktop-runtime";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";

const PLAN_FILE_FETCH_MAX = 512 * 1024;
const VIEW_PLAN_ACTION_ID = "__view_plan__";

const PLAN_MARKDOWN_CLASS =
  "prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2 [&_pre]:max-w-full [&_.not-prose]:my-2 [&_li.task-list-item]:flex [&_li.task-list-item]:items-start [&_li.task-list-item]:gap-2 [&_li.task-list-item>input]:mt-1 [&_li.task-list-item>input]:shrink-0";

function planStepsFromIntent(planIntent: AgentPlan | null | undefined) {
  if (!planIntent?.entries?.length) return null;
  return planIntent.entries.map((entry, index) => ({
    id: String(index),
    title: entry.content,
  }));
}

function planStepsFromPermissionTodos(
  todos: PendingPermission["plan_todos"],
) {
  if (!todos?.length) return null;
  const steps = todos
    .map((todo, index) => {
      const title = todo.content?.trim() ?? "";
      if (!title) return null;
      return { id: todo.id?.trim() || String(index), title };
    })
    .filter((step): step is { id: string; title: string } => step !== null);
  return steps.length > 0 ? steps : null;
}

export function AgentPermissionCard({
  permission,
  markdown,
  /** Structured plan-intent steps only (e.g. Codex). Never pass live TodoWrite execution. */
  planIntent = null,
  planFilePath = null,
  onRespond,
}: {
  permission: PendingPermission;
  markdown: string | null;
  planIntent?: AgentPlan | null;
  planFilePath?: string | null;
  onRespond: (optionId: string) => void;
}) {
  const t = useTranslations("Agent.components.chatPanel");
  const questions = useMemo(() => permissionQuestions(permission), [permission]);
  const command = useMemo(
    () =>
      resolvePermissionCommand({
        tool: permission.tool,
        description: permission.description,
        contentMarkdown: markdown,
      }),
    [markdown, permission.description, permission.tool],
  );
  const description = permissionDescriptionToRender(permission.description, command);
  const isAskUser = questions.length > 0;
  const isPlanExit = isPlanExitPermission(permission);

  const [planFileMarkdown, setPlanFileMarkdown] = useState<string | null>(null);
  const [viewingPlan, setViewingPlan] = useState(false);

  useEffect(() => {
    setViewingPlan(false);
  }, [permission.request_id]);

  useEffect(() => {
    if (!isPlanExit || !planFilePath || markdown?.trim()) {
      setPlanFileMarkdown(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await getRuntimeApiConfig();
        const base = httpBase(cfg);
        if (!base) return;
        const url = composerFileUrlFromPath(planFilePath, base, cfg.token);
        const response = await fetch(url);
        if (!response.ok) return;
        const text = await response.text();
        if (cancelled) return;
        setPlanFileMarkdown(text.length > PLAN_FILE_FETCH_MAX
          ? `${text.slice(0, PLAN_FILE_FETCH_MAX)}\n\n…`
          : text);
      } catch {
        if (!cancelled) setPlanFileMarkdown(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPlanExit, markdown, planFilePath]);

  const overviewMarkdown = useMemo(() => {
    const fromPermission = markdown?.trim();
    if (fromPermission) return fromPermission;
    return planFileMarkdown?.trim() || null;
  }, [markdown, planFileMarkdown]);

  const structuredPlanSteps = useMemo(
    () =>
      planStepsFromIntent(planIntent)
      ?? planStepsFromPermissionTodos(permission.plan_todos),
    [permission.plan_todos, planIntent],
  );

  const overview = useMemo(
    () =>
      parsePlanOverviewFromMarkdown(overviewMarkdown, {
        // Structured createPlan todos own the To-dos well; keep markdown checklists in body only.
        includeChecklistSteps: !structuredPlanSteps?.length,
      }),
    [overviewMarkdown, structuredPlanSteps],
  );

  const planSteps = useMemo(() => {
    if (structuredPlanSteps?.length) return structuredPlanSteps;
    if (overview?.steps.length) return overview.steps;
    // Markdown/plan-file agents: omit todos when we only have prose.
    return [];
  }, [overview, structuredPlanSteps]);

  const hasTodos = planSteps.length > 0;
  // No checklist: markdown already occupies the body — skip View plan.
  // With todos: default todos; View plan swaps in an inline markdown preview.
  const showPlanPreview = !hasTodos || viewingPlan;
  // View plan expands the permission slot; collapsed todos stay at the shared 50cqh budget.
  const permissionSlotMaxH = isPlanExit && showPlanPreview ? "max-h-[80cqh]" : "max-h-[50cqh]";
  const approvalCardMaxH = isPlanExit && showPlanPreview ? "80cqh" : "50cqh";
  const planTitle = overview?.title || (description || undefined);
  const planSummary = overview?.summary;
  const commandActions = useMemo(
    () => permissionCommandActions(permission),
    [permission],
  );
  const planActions = useMemo((): ApprovalAction[] => {
    const rejectId = defaultRejectOptionId(permission);
    const allowId = defaultAllowOptionId(permission);
    const actions: ApprovalAction[] = [
      { id: rejectId, label: t("keepPlanning"), variant: "ghost" },
    ];
    if (hasTodos) {
      actions.push({
        id: VIEW_PLAN_ACTION_ID,
        label: viewingPlan ? t("viewTodos") : t("viewPlan"),
        variant: "ghost",
      });
    }
    actions.push({ id: allowId, label: t("approve"), variant: "primary" });
    return actions;
  }, [hasTodos, permission, t, viewingPlan]);

  if (isAskUser) {
    return (
      <div data-agent-chat-permission="" className="min-h-0 max-h-[50cqh] min-w-0">
        <ApprovalCard
          variant="questions"
          title={t("askUserTitle")}
          questions={questions}
          approveLabel={t("continue")}
          rejectLabel={t("skip")}
          onApprove={(payload) => {
            const answers = payload?.answers ?? {};
            onRespond(`answers:${JSON.stringify(answers)}`);
          }}
          onReject={() => onRespond("reject_once")}
        />
      </div>
    );
  }

  // Plan exit wins over command heuristics: plan markdown often contains `|`
  // tables that lookLikeShellCommand would otherwise treat as shell pipes.
  // Expand to ~80cqh only while viewing plan markdown; todos view stays ~50cqh.
  if (isPlanExit) {
    return (
      <div
        data-agent-chat-permission=""
        className={`min-h-0 min-w-0 ${permissionSlotMaxH}`}
        style={{ ["--approval-card-max-height" as string]: approvalCardMaxH }}
      >
        <ApprovalCard
          variant="plan"
          title={t("planApprovalTitle")}
          planTitle={planTitle}
          planSummary={showPlanPreview ? undefined : planSummary}
          plan={planSteps}
          planView={showPlanPreview ? "body" : "todos"}
          planBody={
            // Keep body mounted whenever todos exist so View plan ↔ todos can crossfade.
            hasTodos || showPlanPreview ? (
              <div data-agent-plan-viewer="">
                {overviewMarkdown ? (
                  <MarkdownRenderer className={PLAN_MARKDOWN_CLASS}>
                    {overviewMarkdown}
                  </MarkdownRenderer>
                ) : (
                  <p className="px-1 py-2 text-sm text-muted-foreground">
                    {t("planViewerEmpty")}
                  </p>
                )}
              </div>
            ) : undefined
          }
          actions={planActions}
          onAction={(actionId) => {
            if (actionId === VIEW_PLAN_ACTION_ID) {
              setViewingPlan((open) => !open);
              return;
            }
            onRespond(actionId);
          }}
        />
      </div>
    );
  }

  return (
    <div data-agent-chat-permission="" className="min-h-0 max-h-[50cqh] min-w-0">
      <ApprovalCard
        variant="command"
        title={t("permissionRequested")}
        command={command || description || permission.tool || "command"}
        actions={commandActions.length > 0 ? commandActions : undefined}
        approveLabel={t("allow")}
        rejectLabel={t("deny")}
        onAction={(optionId) => onRespond(optionId)}
        onApprove={() => onRespond(defaultAllowOptionId(permission))}
        onReject={() => onRespond(defaultRejectOptionId(permission))}
      />
    </div>
  );
}

export function isPlanExitPermission(permission: {
  tool?: string | null;
  description?: string | null;
  content_markdown?: string | null;
}): boolean {
  const tool = permission.tool ?? "";
  const description = permission.description ?? "";
  const markdown = permission.content_markdown?.trim() ?? "";
  if (
    /exit.?plan|approve.?plan|plan.?mode/i.test(tool) ||
    /exit.?plan|approve.?plan/i.test(description)
  ) {
    return true;
  }
  // Fallback when tool label is generic but body is clearly a plan doc.
  return /^#\s*plan\b/im.test(markdown);
}

/** Prefer transcript plan.md; fall back to ExitPlanMode planFilePath echoed in description. */
export function resolvePlanExitFilePath(
  permission: { description?: string | null } | null | undefined,
  messages: AgentMessage[],
): string | null {
  const fromTranscript = findRecentPlanFilePath(messages);
  if (fromTranscript) return fromTranscript;
  const description = permission?.description?.trim() ?? "";
  if (!description) return null;
  if (/(?:^|[/\\])(?:plan|PLAN)\.md$/i.test(description) || /[/\\].+\.md$/i.test(description)) {
    return description;
  }
  return null;
}

function permissionQuestions(permission: PendingPermission): ApprovalQuestion[] {
  const fromWire = permission.questions ?? [];
  if (fromWire.length > 0) {
    return fromWire.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options ?? [],
    }));
  }
  return [];
}

/** Prefer once/accept over always so Grok-style order (always, once, reject) still primaries once. */
export function preferredPrimaryOptionId(permission: PendingPermission): string {
  const once = permission.options.find((option) => isAllowOnceOption(option));
  if (once) return once.option_id;
  return defaultAllowOptionId(permission);
}

export function defaultAllowOptionId(permission: PendingPermission): string {
  const allow = permission.options.find(
    (option) =>
      /allow|accept|approve/i.test(option.option_id) ||
      /allow|accept|approve/i.test(option.kind) ||
      /allow|accept|approve/i.test(option.name),
  );
  return allow?.option_id ?? permission.options[0]?.option_id ?? "allow_once";
}

function defaultRejectOptionId(permission: PendingPermission): string {
  const reject = permission.options.find((option) => isRejectOption(option));
  return reject?.option_id ?? "reject_once";
}

function permissionCommandActions(permission: PendingPermission): ApprovalAction[] {
  if (permission.options.length === 0) return [];
  const primaryId = preferredPrimaryOptionId(permission);
  return permission.options.map((option) => ({
    id: option.option_id,
    label: option.name,
    variant:
      option.option_id === primaryId && !isRejectOption(option)
        ? "primary"
        : "ghost",
  }));
}

function isAllowOnceOption(option: AgentChatPermissionOption): boolean {
  const id = option.option_id;
  const kind = option.kind;
  const name = option.name;
  return (
    /allow[_-]?once|^allow$|^accept$|^once$|^yes$/i.test(id)
    || /allow[_-]?once|^allow$|^accept$|^once$/i.test(kind)
    || /^allow once$|^yes$|^accept$/i.test(name.trim())
  );
}

function isRejectOption(option: AgentChatPermissionOption): boolean {
  return (
    /reject|deny|skip|cancel|decline/i.test(option.option_id)
    || /reject|deny|skip|cancel|decline/i.test(option.kind)
    || /reject|deny|skip|cancel|decline|^no\b/i.test(option.name)
  );
}
