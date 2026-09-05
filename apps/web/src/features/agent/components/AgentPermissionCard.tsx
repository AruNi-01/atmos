"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ApprovalCard, type ApprovalQuestion } from "@workspace/ui";
import type { AgentPlan } from "@/features/agent/lib/agent-chat-types";
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

  const overview = useMemo(
    () => parsePlanOverviewFromMarkdown(overviewMarkdown),
    [overviewMarkdown],
  );

  const planSteps = useMemo(() => {
    if (overview?.steps.length) return overview.steps;
    // Markdown/plan-file agents: omit todos when we only have prose.
    if (overviewMarkdown) return [];
    // Codex-style structured plan-intent todos (not execution TodoWrite).
    return (planIntent?.entries ?? []).map((entry, index) => ({
      id: String(index),
      title: entry.content,
    }));
  }, [overview, overviewMarkdown, planIntent]);

  const planTitle = overview?.title || (description || undefined);
  const planSummary = overview?.summary;

  if (isAskUser) {
    return (
      <div data-agent-chat-permission="" className="min-w-0">
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

  if (isPlanExit && !command) {
    return (
      <div data-agent-chat-permission="" className="min-w-0 space-y-2">
        <ApprovalCard
          variant="plan"
          title={t("planApprovalTitle")}
          planTitle={planTitle}
          planSummary={planSummary}
          plan={planSteps}
          approveLabel={t("approve")}
          rejectLabel={t("viewPlan")}
          onApprove={() => onRespond(defaultAllowOptionId(permission))}
          onReject={() => setViewingPlan((open) => !open)}
          onExpandPlan={() => setViewingPlan((open) => !open)}
        />
        {viewingPlan ? (
          <div
            data-agent-plan-viewer=""
            className="max-h-[min(70vh,36rem)] min-h-[16rem] overflow-auto rounded-xl border border-border bg-muted/20 px-3 py-2"
          >
            {overviewMarkdown ? (
              <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2 [&_pre]:max-w-full [&_.not-prose]:my-2">
                {overviewMarkdown}
              </MarkdownRenderer>
            ) : (
              <p className="px-1 py-2 text-sm text-muted-foreground">{t("planViewerEmpty")}</p>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div data-agent-chat-permission="" className="min-w-0">
      <ApprovalCard
        variant="command"
        title={t("permissionRequested")}
        command={command || description || permission.tool || "command"}
        approveLabel={t("allow")}
        rejectLabel={t("deny")}
        onApprove={() => onRespond(defaultAllowOptionId(permission))}
        onReject={() => onRespond(defaultRejectOptionId(permission))}
      />
    </div>
  );
}

export function isPlanExitPermission(permission: {
  tool?: string | null;
  description?: string | null;
}): boolean {
  const tool = permission.tool ?? "";
  const description = permission.description ?? "";
  return (
    /exit.?plan|approve.?plan|plan.?mode/i.test(tool) ||
    /exit.?plan|approve.?plan/i.test(description)
  );
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

export function defaultAllowOptionId(permission: PendingPermission): string {
  const allow = permission.options.find(
    (option) =>
      /allow|accept|approve/i.test(option.option_id) ||
      /allow|accept|approve/i.test(option.name),
  );
  return allow?.option_id ?? permission.options[0]?.option_id ?? "allow_once";
}

function defaultRejectOptionId(permission: PendingPermission): string {
  const reject = permission.options.find(
    (option) =>
      /reject|deny|skip/i.test(option.option_id) ||
      /reject|deny|skip/i.test(option.name),
  );
  return reject?.option_id ?? "reject_once";
}
