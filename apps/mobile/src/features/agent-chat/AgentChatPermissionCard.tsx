import { Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { ShieldIcon } from "@/ui/icons/lucide-native";
import { GlassTextButton } from "@/ui/primitives/glass-action-buttons";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { CARD_BODY, CARD_GAP, CardHeader, ChipRow } from "./cards/expanded-card";
import { copy, historicPermissionTitle, isPlanExitRequest } from "./copy";

export type AgentChatPermissionPrompt = {
  request_id: string;
  tool?: string;
  description: string;
  content_markdown?: string | null;
  options?: Array<{ option_id: string; name: string }> | null;
  questions?: Array<{ id: string; prompt: string; options?: string[] }> | null;
  plan_todos?: Array<{ id?: string | null; content: string; status?: string }> | null;
};

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
  const todos = request.plan_todos ?? [];
  const planExit = isPlanExitRequest(request);
  const path = planExit ? (filePath?.trim() ?? "") : "";
  const intent = description && description !== path ? description : "";
  const showEmpty = planExit && !intent && !path && markdown.length === 0 && todos.length === 0;
  const body = { color: theme.colors.secondaryLabel, ...CARD_BODY };

  return (
    <View style={{ gap: CARD_GAP }}>
      <CardHeader icon={ShieldIcon} title={historicPermissionTitle(request)} />
      {questions.map((question) => (
        <Text key={question.id} selectable style={body}>
          {question.prompt}
        </Text>
      ))}
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
        <AgentChatMarkdown fontSize={14} lineHeight={20} text={markdown} variant="card" />
      ) : null}
      {showEmpty ? (
        <Text selectable style={body}>
          {copy.planViewerEmpty}
        </Text>
      ) : null}
      {options.length > 0 ? (
        <ChipRow>
          {options.map((option) => {
            const label = option.name.trim() || option.option_id;
            return (
              <GlassTextButton
                key={option.option_id}
                label={label}
                onPress={() =>
                  onRespond({ requestId: request.request_id, optionId: option.option_id })
                }
              />
            );
          })}
        </ChipRow>
      ) : null}
    </View>
  );
}
