import { Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassTextButton } from "@/ui/primitives/glass-action-buttons";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
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
  const body = { color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 };

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: theme.colors.label, fontSize: 16, fontWeight: "700", lineHeight: 21 }}>
        {historicPermissionTitle(request)}
      </Text>
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
        <AgentChatMarkdown text={markdown} />
      ) : null}
      {showEmpty ? (
        <Text selectable style={body}>
          {copy.planViewerEmpty}
        </Text>
      ) : null}
      {options.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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
        </View>
      ) : null}
    </View>
  );
}
