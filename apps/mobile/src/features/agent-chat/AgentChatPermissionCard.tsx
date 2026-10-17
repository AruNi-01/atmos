import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronUp, CornerDownLeft, MessageCircleQuestion } from "lucide-react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { copy, historicPermissionTitle, isPlanExitRequest } from "./copy";
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
  options?: Array<{ option_id: string; name: string }> | null;
  questions?: Array<{ id: string; prompt: string; options?: string[] }> | null;
  plan_todos?: Array<{ id?: string | null; content: string; status?: string }> | null;
};

function QuestionPermission({
  onRespond,
  request,
}: {
  onRespond: (input: { requestId: string; optionId: string }) => void;
  request: AgentChatPermissionPrompt;
}) {
  const theme = useMobileTheme();
  const questions = request.questions ?? [];
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safeStep = Math.min(step, Math.max(questions.length - 1, 0));
  const question = questions[safeStep];
  const canContinue = permissionQuestionsCanContinue(questions, answers);

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

  const iconColor = theme.isDark ? "#60a5fa" : "#3b82f6";
  const iconFill = theme.isDark ? "rgba(59, 130, 246, 0.18)" : "rgba(59, 130, 246, 0.12)";

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
            color: theme.colors.label,
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
            color: theme.colors.label,
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
                accessibilityState={{ selected }}
                key={option}
                onPress={() => selectOption(option)}
                style={{
                  alignItems: "center",
                  backgroundColor: selected ? theme.colors.card : "transparent",
                  borderColor: selected ? "transparent" : theme.colors.glassBorder,
                  borderRadius: 7,
                  borderWidth: 0.5,
                  flexDirection: "row",
                  gap: 8,
                  padding: 5,
                }}
              >
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: selected ? theme.colors.primary : theme.colors.cardSubtle,
                    borderRadius: 4,
                    height: 18,
                    justifyContent: "center",
                    width: 18,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? theme.colors.labelInverse : theme.colors.tertiaryLabel,
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
                    color: theme.colors.label,
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
            <ChevronUp color={theme.colors.tertiaryLabel} size={14} strokeWidth={2} />
          </Pressable>
          <Text
            style={{
              color: theme.colors.tertiaryLabel,
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
            <ChevronDown color={theme.colors.tertiaryLabel} size={14} strokeWidth={2} />
          </Pressable>
        </View>
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
              backgroundColor: theme.colors.cardSubtle,
              borderRadius: 999,
              paddingHorizontal: 11,
              paddingVertical: 5,
            }}
          >
            <Text style={{ color: theme.colors.label, fontSize: 12.5, fontWeight: "500" }}>
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
              backgroundColor: theme.colors.primary,
              borderRadius: 999,
              flexDirection: "row",
              gap: 5,
              opacity: canContinue ? 1 : 0.38,
              paddingHorizontal: 11,
              paddingVertical: 5,
            }}
          >
            <Text style={{ color: theme.colors.labelInverse, fontSize: 12.5, fontWeight: "500" }}>
              {copy.continue}
            </Text>
            <CornerDownLeft color={theme.colors.labelInverse} size={12} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function AgentChatPermissionCard({
  filePath,
  request,
  onRespond,
}: {
  filePath?: string | null;
  request: AgentChatPermissionPrompt;
  onRespond: (input: { requestId: string; optionId: string }) => void;
}) {
  const theme = useMobileTheme();
  const description = request.description.trim();
  const markdown = request.content_markdown?.trim() ?? "";
  const options = request.options ?? [];
  const questions = request.questions ?? [];
  if (questions.length > 0) {
    return <QuestionPermission onRespond={onRespond} request={request} />;
  }
  const todos = request.plan_todos ?? [];
  const planExit = isPlanExitRequest(request);
  const path = planExit ? (filePath?.trim() ?? "") : "";
  const intent = description && description !== path ? description : "";
  const showEmpty = planExit && !intent && !path && markdown.length === 0 && todos.length === 0;
  const body = { color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 };

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: theme.colors.label, fontSize: 16, fontWeight: "700", lineHeight: 21 }}>
        {historicPermissionTitle(request)}
      </Text>
      {todos.map((todo) => (
        <Text key={todo.id ?? todo.content} selectable style={body}>
          {todo.content}
        </Text>
      ))}
      {intent ? (
        <Text selectable style={body}>
          {intent}
        </Text>
      ) : null}
      {path ? (
        <Text selectable style={body}>
          {path}
        </Text>
      ) : null}
      {markdown.length > 0 && markdown !== description ? (
        <AgentChatMarkdown text={markdown} />
      ) : null}
      {showEmpty ? (
        <Text selectable style={body}>
          {copy.planViewerEmpty}
        </Text>
      ) : null}
      {options.length > 0 ? (
        <View style={{ gap: 8 }}>
          {options.map((option) => {
            const label = option.name.trim() || option.option_id;
            return (
              <Pressable
                accessibilityRole="button"
                key={option.option_id}
                onPress={() =>
                  onRespond({ requestId: request.request_id, optionId: option.option_id })
                }
                style={({ pressed }) => ({
                  backgroundColor: pressed ? theme.colors.mutedPressed : theme.colors.control,
                  borderColor: theme.colors.controlBorder,
                  borderCurve: "continuous",
                  borderRadius: 12,
                  borderWidth: StyleSheet.hairlineWidth,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                })}
              >
                <Text
                  style={{
                    color: theme.colors.label,
                    fontSize: 15,
                    fontWeight: "600",
                    lineHeight: 20,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
