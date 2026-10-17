import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import {
  ChevronDown,
  ChevronUp,
  CircleDashed,
  CornerDownLeft,
  ListTodo,
  MessageCircleQuestion,
  Terminal,
} from "lucide-react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { TOOL_MARKDOWN_LINE_HEIGHT } from "./markdown-chrome";
import {
  APPROVAL_COMMAND_ICON_DARK,
  APPROVAL_COMMAND_ICON_FILL_DARK,
  APPROVAL_COMMAND_ICON_FILL_LIGHT,
  APPROVAL_COMMAND_ICON_LIGHT,
  APPROVAL_OPTION_BORDER,
  APPROVAL_PLAN_ICON_DARK,
  APPROVAL_PLAN_ICON_FILL_DARK,
  APPROVAL_PLAN_ICON_FILL_LIGHT,
  APPROVAL_PLAN_ICON_LIGHT,
  APPROVAL_QUESTION_ICON_DARK,
  APPROVAL_QUESTION_ICON_FILL_DARK,
  APPROVAL_QUESTION_ICON_FILL_LIGHT,
  APPROVAL_QUESTION_ICON_LIGHT,
  approvalCardFill,
  approvalGhostFill,
  approvalInk,
  approvalKeyFill,
  approvalMuted,
  approvalOptionSelectedFill,
  approvalPrimaryFill,
  approvalPrimaryInk,
  approvalQuiet,
  approvalShadow,
  approvalWell,
} from "./approval-ink";
import { chatMutedForeground } from "./chat-ink";
import { copy, historicPermissionTitle, isPlanExitRequest } from "./copy";
import { commandPermissionActions, commandPermissionText } from "./permission-command";
import {
  PLAN_TODO_PREVIEW_COUNT,
  defaultAllowOptionId,
  defaultRejectOptionId,
  planPermissionModel,
} from "./permission-plan";
import {
  PERMISSION_QUESTION_ADVANCE_MS,
  PERMISSION_QUESTION_REJECT_ID,
  permissionQuestionAnswersOptionId,
  permissionQuestionLetter,
  permissionQuestionsCanContinue,
} from "./permission-questions";

export type AgentChatPermissionPrompt = {
  request_id: string;
  tool?: string;
  description: string;
  content_markdown?: string | null;
  options?: Array<{ option_id: string; name: string; kind?: string }> | null;
  questions?: Array<{ id: string; prompt: string; options?: string[] }> | null;
  plan_todos?: Array<{ id?: string | null; content: string; status?: string }> | null;
};

function useApprovalTone() {
  const theme = useMobileTheme();
  const dark = theme.isDark;
  return {
    dark,
    ghost: approvalGhostFill(dark),
    ink: approvalInk(dark),
    keyFill: approvalKeyFill(dark),
    muted: approvalMuted(dark),
    optionSelected: approvalOptionSelectedFill(dark),
    primaryFill: approvalPrimaryFill(dark),
    primaryInk: approvalPrimaryInk(dark),
    quiet: approvalQuiet(dark),
    well: approvalWell(dark),
  };
}

function ApprovalShell({ children }: { children: ReactNode }) {
  const theme = useMobileTheme();
  return (
    <View
      style={{
        backgroundColor: approvalCardFill(theme.isDark),
        borderRadius: 22,
        boxShadow: approvalShadow(theme.isDark),
        padding: 12,
        width: "100%",
      }}
    >
      {children}
    </View>
  );
}

function QuestionPermission({
  onRespond,
  readOnly = false,
  request,
}: {
  onRespond: (input: { requestId: string; optionId: string }) => void;
  readOnly?: boolean;
  request: AgentChatPermissionPrompt;
}) {
  const theme = useMobileTheme();
  const tone = useApprovalTone();
  const questions = request.questions ?? [];
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safeStep = Math.min(step, Math.max(questions.length - 1, 0));
  const question = questions[safeStep];
  const canContinue = permissionQuestionsCanContinue(questions, answers);
  const showQuestionFooter = !readOnly || questions.length > 1;

  useEffect(
    () => () => {
      if (advanceRef.current) clearTimeout(advanceRef.current);
    },
    [],
  );

  if (!question) return null;

  const goToStep = (next: number) => {
    if (advanceRef.current) clearTimeout(advanceRef.current);
    setStep(Math.min(Math.max(next, 0), questions.length - 1));
  };

  const selectOption = (option: string) => {
    setAnswers((current) => ({ ...current, [question.id]: option }));
    if (safeStep >= questions.length - 1) return;
    if (advanceRef.current) clearTimeout(advanceRef.current);
    advanceRef.current = setTimeout(() => {
      setStep((current) => Math.min(current + 1, questions.length - 1));
    }, PERMISSION_QUESTION_ADVANCE_MS);
  };

  const iconColor = theme.isDark ? APPROVAL_QUESTION_ICON_DARK : APPROVAL_QUESTION_ICON_LIGHT;
  const iconFill = theme.isDark
    ? APPROVAL_QUESTION_ICON_FILL_DARK
    : APPROVAL_QUESTION_ICON_FILL_LIGHT;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8, height: 24 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: iconFill,
            borderRadius: 6,
            height: 24,
            justifyContent: "center",
            width: 24,
          }}
        >
          <MessageCircleQuestion color={iconColor} size={14} strokeWidth={2} />
        </View>
        <Text
          style={{
            color: tone.ink,
            flexShrink: 1,
            fontSize: 13.5,
            fontWeight: "500",
            letterSpacing: -0.14,
            lineHeight: 17,
          }}
        >
          {historicPermissionTitle(request)}
        </Text>
      </View>
      <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
        <Text
          style={{
            color: tone.ink,
            fontSize: 13,
            fontWeight: "500",
            lineHeight: 18,
            paddingLeft: 2,
          }}
        >
          {question.prompt}
        </Text>
        <View accessibilityRole="radiogroup" style={{ gap: 5 }}>
          {(question.options ?? []).map((option, index) => {
            const selected = answers[question.id] === option;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ disabled: readOnly, selected }}
                disabled={readOnly}
                key={option}
                onPress={() => {
                  if (readOnly) return;
                  selectOption(option);
                }}
                style={{
                  alignItems: "center",
                  backgroundColor: selected ? tone.optionSelected : "transparent",
                  borderColor: selected || tone.dark ? "transparent" : APPROVAL_OPTION_BORDER,
                  borderRadius: 7,
                  borderWidth: selected || tone.dark ? 0 : 0.5,
                  flexDirection: "row",
                  gap: 8,
                  padding: 5,
                }}
              >
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: selected ? tone.primaryFill : tone.keyFill,
                    borderRadius: 4,
                    height: 18,
                    justifyContent: "center",
                    width: 18,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? tone.primaryInk : tone.quiet,
                      fontSize: 10.5,
                      fontWeight: "600",
                      lineHeight: 14,
                    }}
                  >
                    {permissionQuestionLetter(index)}
                  </Text>
                </View>
                <Text
                  style={{
                    color: tone.ink,
                    flexShrink: 1,
                    fontSize: 12.5,
                    lineHeight: 16,
                  }}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {showQuestionFooter ? (
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "space-between",
            paddingLeft: 2,
            paddingTop: 4,
          }}
        >
          <View
            accessibilityLabel={`Question ${safeStep + 1} of ${questions.length}`}
            style={{ alignItems: "center", flexDirection: "row", gap: 4 }}
          >
            <Pressable
              accessibilityLabel={copy.previousQuestion}
              accessibilityState={{ disabled: safeStep <= 0 }}
              disabled={safeStep <= 0}
              hitSlop={6}
              onPress={() => goToStep(safeStep - 1)}
              style={{ opacity: safeStep <= 0 ? 0.28 : 1 }}
            >
              <ChevronUp color={tone.quiet} size={14} strokeWidth={2} />
            </Pressable>
            <Text
              style={{
                color: tone.quiet,
                fontSize: 12,
                fontVariant: ["tabular-nums"],
                fontWeight: "500",
                lineHeight: 16,
              }}
            >
              {`${safeStep + 1} / ${questions.length}`}
            </Text>
            <Pressable
              accessibilityLabel={copy.nextQuestion}
              accessibilityState={{ disabled: safeStep >= questions.length - 1 }}
              disabled={safeStep >= questions.length - 1}
              hitSlop={6}
              onPress={() => goToStep(safeStep + 1)}
              style={{ opacity: safeStep >= questions.length - 1 ? 0.28 : 1 }}
            >
              <ChevronDown color={tone.quiet} size={14} strokeWidth={2} />
            </Pressable>
          </View>
          {readOnly ? null : (
            <View style={{ flexDirection: "row", gap: 6, marginLeft: "auto" }}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  onRespond({
                    requestId: request.request_id,
                    optionId: PERMISSION_QUESTION_REJECT_ID,
                  })
                }
                style={{
                  backgroundColor: tone.ghost,
                  borderRadius: 999,
                  paddingHorizontal: 11,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ color: tone.ink, fontSize: 12.5, fontWeight: "500" }}>
                  {copy.skip}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canContinue }}
                disabled={!canContinue}
                onPress={() =>
                  onRespond({
                    requestId: request.request_id,
                    optionId: permissionQuestionAnswersOptionId(answers),
                  })
                }
                style={{
                  alignItems: "center",
                  backgroundColor: tone.primaryFill,
                  borderRadius: 999,
                  flexDirection: "row",
                  gap: 5,
                  opacity: canContinue ? 1 : 0.38,
                  paddingHorizontal: 11,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ color: tone.primaryInk, fontSize: 12.5, fontWeight: "500" }}>
                  {copy.continue}
                </Text>
                <CornerDownLeft color={tone.primaryInk} size={12} strokeWidth={2} />
              </Pressable>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function PlanPermission({
  onRespond,
  readOnly = false,
  request,
}: {
  onRespond: (input: { requestId: string; optionId: string }) => void;
  readOnly?: boolean;
  request: AgentChatPermissionPrompt;
}) {
  const theme = useMobileTheme();
  const tone = useApprovalTone();
  const model = planPermissionModel({
    description: request.description,
    markdown: request.content_markdown ?? "",
    options: request.options ?? [],
    todos: request.plan_todos ?? [],
  });
  const [viewingPlan, setViewingPlan] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasTodos = model.steps.length > 0;
  const showBody = !hasTodos || viewingPlan;
  const preview = model.steps.slice(0, PLAN_TODO_PREVIEW_COUNT);
  const rest = model.steps.slice(PLAN_TODO_PREVIEW_COUNT);
  const shown = expanded ? model.steps : preview;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8, height: 24 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: tone.dark
              ? APPROVAL_PLAN_ICON_FILL_DARK
              : APPROVAL_PLAN_ICON_FILL_LIGHT,
            borderRadius: 6,
            height: 24,
            justifyContent: "center",
            width: 24,
          }}
        >
          <ListTodo
            color={tone.dark ? APPROVAL_PLAN_ICON_DARK : APPROVAL_PLAN_ICON_LIGHT}
            size={14}
            strokeWidth={2}
          />
        </View>
        <Text
          style={{
            color: tone.ink,
            flexShrink: 1,
            fontSize: 13.5,
            fontWeight: "500",
            letterSpacing: -0.14,
            lineHeight: 17,
          }}
        >
          {copy.planApprovalTitle}
        </Text>
      </View>
      {showBody ? (
        model.markdown ? (
          <AgentChatMarkdown
            fontSize={13}
            lineHeight={TOOL_MARKDOWN_LINE_HEIGHT}
            prose="approval"
            text={model.markdown}
          />
        ) : readOnly ? null : (
          <Text
            style={{
              color: chatMutedForeground(theme.isDark),
              fontSize: 14,
              lineHeight: 20,
              paddingHorizontal: 4,
              paddingVertical: 8,
            }}
          >
            {copy.planViewerEmpty}
          </Text>
        )
      ) : (
        <View style={{ gap: 12 }}>
          {model.title || model.summary ? (
            <View style={{ gap: 2, paddingLeft: 2 }}>
              {model.title ? (
                <Text
                  style={{
                    color: tone.ink,
                    fontSize: 15,
                    fontWeight: "500",
                    letterSpacing: -0.15,
                    lineHeight: 20,
                  }}
                >
                  {model.title}
                </Text>
              ) : null}
              {model.summary ? (
                <Text style={{ color: tone.muted, fontSize: 12.5, lineHeight: 18 }}>
                  {model.summary}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View
            style={{
              backgroundColor: tone.well,
              borderRadius: 8,
              paddingBottom: 10,
              paddingHorizontal: 12,
              paddingTop: 8,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: 8, minHeight: 22 }}>
              <ListTodo color={tone.ink} size={14} strokeWidth={2} />
              <Text style={{ color: tone.ink, fontSize: 13, fontWeight: "500" }}>
                {copy.planTodosHeading}
              </Text>
              <Text
                style={{
                  color: tone.quiet,
                  fontSize: 13,
                  fontVariant: ["tabular-nums"],
                  marginLeft: "auto",
                }}
              >
                {model.steps.length}
              </Text>
            </View>
            <View style={{ gap: 8, paddingTop: 8 }}>
              {shown.map((step) => (
                <View
                  key={step.id}
                  style={{ alignItems: "flex-start", flexDirection: "row", gap: 8 }}
                >
                  <CircleDashed color={tone.quiet} size={14} strokeWidth={2} />
                  <Text
                    style={{
                      color: tone.quiet,
                      flexShrink: 1,
                      fontSize: 13,
                      lineHeight: 18,
                    }}
                  >
                    {step.title}
                  </Text>
                </View>
              ))}
            </View>
            {rest.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setExpanded((open) => !open)}
                style={{ marginTop: 8 }}
              >
                <Text style={{ color: tone.quiet, fontSize: 13, lineHeight: 18 }}>
                  {expanded ? copy.showLess : `${rest.length} more`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
      {readOnly ? null : (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            justifyContent: "flex-end",
            paddingLeft: 2,
            paddingTop: 4,
          }}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => onRespond({ requestId: request.request_id, optionId: model.rejectId })}
            style={{
              backgroundColor: tone.ghost,
              borderRadius: 999,
              paddingHorizontal: 11,
              paddingVertical: 5,
            }}
          >
            <Text style={{ color: tone.ink, fontSize: 12.5, fontWeight: "500" }}>
              {copy.keepPlanning}
            </Text>
          </Pressable>
          {hasTodos ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setViewingPlan((open) => !open)}
              style={{
                backgroundColor: tone.ghost,
                borderRadius: 999,
                paddingHorizontal: 11,
                paddingVertical: 5,
              }}
            >
              <Text style={{ color: tone.ink, fontSize: 12.5, fontWeight: "500" }}>
                {viewingPlan ? copy.viewTodos : copy.viewPlan}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => onRespond({ requestId: request.request_id, optionId: model.allowId })}
            style={{
              alignItems: "center",
              backgroundColor: tone.primaryFill,
              borderRadius: 999,
              flexDirection: "row",
              gap: 5,
              paddingHorizontal: 11,
              paddingVertical: 5,
            }}
          >
            <Text style={{ color: tone.primaryInk, fontSize: 12.5, fontWeight: "500" }}>
              {copy.approve}
            </Text>
            <CornerDownLeft color={tone.primaryInk} size={12} strokeWidth={2} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function CommandPermission({
  onRespond,
  readOnly = false,
  request,
}: {
  onRespond: (input: { requestId: string; optionId: string }) => void;
  readOnly?: boolean;
  request: AgentChatPermissionPrompt;
}) {
  const theme = useMobileTheme();
  const tone = useApprovalTone();
  const options = request.options ?? [];
  const wired = commandPermissionActions(options);
  const actions =
    wired.length > 0
      ? wired
      : [
          { id: defaultRejectOptionId(options), label: copy.deny, variant: "ghost" as const },
          { id: defaultAllowOptionId(options), label: copy.allow, variant: "primary" as const },
        ];
  const command = commandPermissionText({
    contentMarkdown: request.content_markdown,
    description: request.description,
    tool: request.tool,
  });
  const iconColor = theme.isDark ? APPROVAL_COMMAND_ICON_DARK : APPROVAL_COMMAND_ICON_LIGHT;
  const iconFill = theme.isDark
    ? APPROVAL_COMMAND_ICON_FILL_DARK
    : APPROVAL_COMMAND_ICON_FILL_LIGHT;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8, height: 24 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: iconFill,
            borderRadius: 6,
            height: 24,
            justifyContent: "center",
            width: 24,
          }}
        >
          <Terminal color={iconColor} size={14} strokeWidth={2} />
        </View>
        <Text
          style={{
            color: tone.ink,
            flexShrink: 1,
            fontSize: 13.5,
            fontWeight: "500",
            letterSpacing: -0.14,
            lineHeight: 17,
          }}
        >
          {copy.permissionRequested}
        </Text>
      </View>
      <View
        style={{
          backgroundColor: tone.well,
          borderRadius: 8,
          paddingBottom: 10,
          paddingHorizontal: 12,
          paddingTop: 8,
        }}
      >
        <Text
          selectable
          style={{
            color: tone.ink,
            fontFamily: "Menlo",
            fontSize: 12.5,
            lineHeight: 18,
          }}
        >
          {command}
        </Text>
      </View>
      {readOnly ? null : (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            justifyContent: "flex-end",
            paddingLeft: 2,
            paddingTop: 4,
          }}
        >
          {actions.map((action) => {
            const primary = action.variant === "primary";
            return (
              <Pressable
                accessibilityRole="button"
                key={action.id}
                onPress={() => onRespond({ requestId: request.request_id, optionId: action.id })}
                style={{
                  alignItems: "center",
                  backgroundColor: primary ? tone.primaryFill : tone.ghost,
                  borderRadius: 999,
                  flexDirection: "row",
                  gap: 5,
                  paddingHorizontal: 11,
                  paddingVertical: 5,
                }}
              >
                <Text
                  style={{
                    color: primary ? tone.primaryInk : tone.ink,
                    fontSize: 12.5,
                    fontWeight: "500",
                  }}
                >
                  {action.label}
                </Text>
                {primary ? (
                  <CornerDownLeft color={tone.primaryInk} size={12} strokeWidth={2} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function AgentChatPermissionCard({
  onRespond,
  readOnly = false,
  request,
}: {
  filePath?: string | null;
  onRespond: (input: { requestId: string; optionId: string }) => void;
  readOnly?: boolean;
  request: AgentChatPermissionPrompt;
}) {
  const questions = request.questions ?? [];
  if (questions.length > 0) {
    return (
      <ApprovalShell>
        <QuestionPermission onRespond={onRespond} readOnly={readOnly} request={request} />
      </ApprovalShell>
    );
  }
  if (isPlanExitRequest(request)) {
    return (
      <ApprovalShell>
        <PlanPermission onRespond={onRespond} readOnly={readOnly} request={request} />
      </ApprovalShell>
    );
  }
  return (
    <ApprovalShell>
      <CommandPermission onRespond={onRespond} readOnly={readOnly} request={request} />
    </ApprovalShell>
  );
}
