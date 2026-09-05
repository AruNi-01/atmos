"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Confirmation,
  ConfirmationActions,
  ConfirmationRequest,
  ShineBorder,
} from "@workspace/ui";
import { MessageCircleQuestion } from "lucide-react";
import { PermissionActionButton } from "./MessageQueueDock";

export type AskUserOption = {
  label: string;
  description?: string | null;
};

export type AskUserQuestion = {
  question: string;
  header?: string | null;
  options: AskUserOption[];
  multiSelect?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseAskUserQuestions(value: unknown): AskUserQuestion[] {
  const root = asRecord(value);
  const nested = root
    ? asRecord(root.args) ?? asRecord(root.input) ?? asRecord(root.parameters) ?? asRecord(root.payload)
    : null;
  const list = Array.isArray(value)
    ? value
    : Array.isArray(root?.questions)
      ? (root!.questions as unknown[])
      : Array.isArray(nested?.questions)
        ? (nested!.questions as unknown[])
        : [];
  return list.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const question =
      (typeof row.question === "string" && row.question.trim())
      || (typeof row.prompt === "string" && row.prompt.trim())
      || (typeof row.text === "string" && row.text.trim())
      || "";
    if (!question) return [];
    const options = Array.isArray(row.options)
      ? row.options.flatMap((opt) => {
          if (typeof opt === "string" && opt.trim()) {
            return [{ label: opt.trim(), description: null }];
          }
          const option = asRecord(opt);
          const label =
            (typeof option?.label === "string" && option.label.trim())
            || (typeof option?.name === "string" && option.name.trim())
            || (typeof option?.value === "string" && option.value.trim())
            || "";
          if (!label) return [];
          return [{
            label,
            description: typeof option?.description === "string" ? option.description : null,
          }];
        })
      : [];
    return [{
      question,
      header: typeof row.header === "string" ? row.header : null,
      options,
      multiSelect: row.multiSelect === true || row.multi_select === true,
    }];
  });
}

/**
 * ApprovalCard — interactive AskUser questions reply surface.
 * Built on the shared Confirmation primitive (same shell as tool approvals).
 */
export function ApprovalCard({
  requestId,
  title,
  questions,
  onSubmit,
  onCancel,
}: {
  requestId: string;
  title?: string | null;
  questions: AskUserQuestion[];
  onSubmit: (answers: Record<string, string | string[]>) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Agent.components.chatPanel");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const ready = useMemo(() => {
    if (questions.length === 0) return false;
    return questions.every((question) => {
      const value = answers[question.question];
      if (Array.isArray(value)) return value.length > 0;
      return typeof value === "string" && value.trim().length > 0;
    });
  }, [answers, questions]);

  const toggle = (question: AskUserQuestion, label: string) => {
    setAnswers((prev) => {
      const current = prev[question.question];
      if (question.multiSelect) {
        const selected = Array.isArray(current) ? [...current] : [];
        const index = selected.indexOf(label);
        if (index >= 0) selected.splice(index, 1);
        else selected.push(label);
        return { ...prev, [question.question]: selected };
      }
      return { ...prev, [question.question]: label };
    });
  };

  const isSelected = (question: AskUserQuestion, label: string) => {
    const value = answers[question.question];
    if (Array.isArray(value)) return value.includes(label);
    return value === label;
  };

  return (
    <Confirmation
      approval={{ id: requestId }}
      state="approval-requested"
      data-agent-chat-ask-user=""
      className="relative min-w-0 max-h-[50vh] overflow-x-hidden overflow-y-auto overscroll-contain rounded-3xl border-foreground/20 bg-background"
    >
      <ShineBorder
        duration={7}
        borderWidth={1}
        shineColor={["#0d9488", "#0f766e"]}
      />
      <ConfirmationRequest>
        <div className="flex items-center gap-2">
          <MessageCircleQuestion className="size-4 shrink-0 text-teal-600" aria-hidden="true" />
          <span className="font-medium text-teal-700 dark:text-teal-400">
            {title?.trim() || t("askUserTitle")}
          </span>
        </div>
        <div className="flex flex-col gap-4">
          {questions.map((question) => (
            <div key={question.question} className="flex min-w-0 flex-col gap-2">
              <div className="min-w-0">
                {question.header ? (
                  <div className="text-xs text-muted-foreground">{question.header}</div>
                ) : null}
                <p className="text-sm font-medium text-foreground">{question.question}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                {question.options.map((option) => {
                  const selected = isSelected(question, option.label);
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => toggle(question, option.label)}
                      className={[
                        "rounded-2xl border px-3 py-2 text-left transition-colors",
                        selected
                          ? "border-teal-600/50 bg-teal-500/10"
                          : "border-border bg-muted/20 hover:bg-muted/40",
                      ].join(" ")}
                    >
                      <div className="text-sm font-medium">{option.label}</div>
                      {option.description ? (
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ConfirmationRequest>
      <ConfirmationActions className="mt-1 w-full min-w-0 flex-nowrap justify-start self-stretch overflow-hidden">
        <PermissionActionButton
          label={t("submitAnswers")}
          variant="default"
          disabled={!ready}
          onClick={() => onSubmit(answers)}
        />
        <PermissionActionButton
          label={t("deny")}
          variant="ghost"
          onClick={onCancel}
        />
      </ConfirmationActions>
    </Confirmation>
  );
}
