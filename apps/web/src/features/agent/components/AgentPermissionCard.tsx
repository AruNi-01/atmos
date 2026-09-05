"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Confirmation,
  ConfirmationActions,
  ConfirmationRequest,
  ShineBorder,
} from "@workspace/ui";
import { ShieldCheck } from "lucide-react";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import type { PendingPermission } from "@/features/agent/lib/chat-helpers";
import {
  permissionDescriptionToRender,
  permissionMarkdownToRender,
  permissionOptionVariant,
  resolvePermissionCommand,
} from "@/features/agent/lib/agent-permission-content";
import { AgentCommandLine } from "./AgentCommandLine";
import { PermissionActionButton } from "./MessageQueueDock";
import { ApprovalCard, parseAskUserQuestions } from "./ApprovalCard";

function isAskUserTool(tool?: string | null): boolean {
  const name = (tool || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return [
    "askuserquestion",
    "ask_user_question",
    "askuser",
    "ask_user",
    "askquestion",
    "ask_question",
    "request_user_input",
    "requestuserinput",
    "questions",
  ].includes(name);
}

function isExitPlanTool(tool?: string | null, description?: string | null): boolean {
  const name = (tool || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const title = (description || "").trim().toLowerCase();
  return (
    name === "exitplanmode"
    || name === "exit_plan_mode"
    || name === "exit_plan"
    || title.includes("ready to code")
  );
}

export function AgentPermissionCard({
  permission,
  markdown,
  onRespond,
  onAnswerQuestions,
}: {
  permission: PendingPermission;
  markdown: string | null;
  onRespond: (optionId: string) => void;
  onAnswerQuestions?: (answers: Record<string, string | string[]>) => void;
}) {
  const t = useTranslations("Agent.components.chatPanel");
  const questions = useMemo(
    () => parseAskUserQuestions(permission.questions ?? permission.raw_input),
    [permission.questions, permission.raw_input],
  );
  const askUser = isAskUserTool(permission.tool) || questions.length > 0;
  const exitPlan = isExitPlanTool(permission.tool, permission.description);

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
  const extraMarkdown = permissionMarkdownToRender(markdown, command);

  if (askUser && questions.length > 0 && onAnswerQuestions) {
    return (
      <ApprovalCard
        requestId={permission.request_id}
        title={permission.description}
        questions={questions}
        onSubmit={onAnswerQuestions}
        onCancel={() => {
          const reject = permission.options.find(
            (opt) => opt.kind === "reject_once" || opt.kind === "reject_always" || /reject|deny|no/i.test(opt.option_id),
          );
          onRespond(reject?.option_id ?? "reject_once");
        }}
      />
    );
  }

  return (
    <Confirmation
      approval={{ id: permission.request_id }}
      state="approval-requested"
      data-agent-chat-permission=""
      data-agent-chat-exit-plan={exitPlan ? "" : undefined}
      className="relative min-w-0 max-h-[40vh] overflow-x-hidden overflow-y-auto overscroll-contain rounded-3xl border-foreground/20 bg-background"
    >
      <ShineBorder
        duration={7}
        borderWidth={1}
        shineColor={exitPlan ? ["#2563eb", "#1d4ed8"] : ["#d97706", "#b45309"]}
      />
      <ConfirmationRequest>
        <div className="flex items-center gap-2">
          <ShieldCheck
            className={`size-4 shrink-0 ${exitPlan ? "text-blue-500" : "text-amber-500"}`}
            aria-hidden="true"
          />
          <span className={`font-medium ${exitPlan ? "text-blue-500" : "text-amber-500"}`}>
            {exitPlan ? t("planApproveTitle") : t("permissionRequested")}
          </span>
        </div>
        {description && !exitPlan ? (
          <p className="max-w-full text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
        {command && !exitPlan ? (
          <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-muted/20">
            <AgentCommandLine command={command} className="px-3 py-2.5" />
          </div>
        ) : null}
        {extraMarkdown ? (
          <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-muted/20">
            <div className="min-w-0 max-w-full overflow-auto px-3 py-1.5 text-sm">
              <MarkdownRenderer className="prose-sm min-w-0 max-w-full overflow-hidden [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_.not-prose]:max-w-full [&_.not-prose]:overflow-x-auto">
                {extraMarkdown}
              </MarkdownRenderer>
            </div>
          </div>
        ) : null}
      </ConfirmationRequest>
      <ConfirmationActions className="mt-1 w-full min-w-0 flex-nowrap justify-start self-stretch overflow-hidden">
        {permission.options.length > 0 ? (
          permission.options.map((opt) => (
            <PermissionActionButton
              key={opt.option_id}
              label={opt.name}
              variant={permissionOptionVariant(opt.kind)}
              onClick={() => onRespond(opt.option_id)}
            />
          ))
        ) : (
          <>
            <PermissionActionButton
              label={t("allow")}
              variant="default"
              onClick={() => onRespond("allow_once")}
            />
            <PermissionActionButton
              label={t("deny")}
              variant="ghost"
              onClick={() => onRespond("reject_once")}
            />
          </>
        )}
      </ConfirmationActions>
    </Confirmation>
  );
}
