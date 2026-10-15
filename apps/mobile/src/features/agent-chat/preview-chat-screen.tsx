import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { parityFixtureById } from "@/features/agent-chat/parity-tree";
import { AgentChatTranscript } from "./AgentChatTranscript";

function param(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ?? "";
}

export function PreviewChatScreen() {
  const params = useLocalSearchParams<{
    fixture?: string | string[];
    theme?: string | string[];
  }>();
  const fixtureId = param(params.fixture) || "F3";
  const theme = param(params.theme) === "dark" ? "dark" : "light";
  const backgroundColor = theme === "dark" ? "#000000" : "#f4f4f6";
  const color = theme === "dark" ? "#f4f4f6" : "#1a1a1a";
  const fixture = parityFixtureById(fixtureId);

  return (
    <View style={{ backgroundColor, flex: 1 }}>
      <Text style={{ color, fontSize: 13, padding: 16 }} testID="parity-ready">
        {fixtureId}
      </Text>
      {fixture ? (
        <AgentChatTranscript key={fixtureId} messages={fixture.messages as AgentMessage[]} />
      ) : (
        <Text style={{ color, fontSize: 15, paddingHorizontal: 16 }}>Missing fixture</Text>
      )}
    </View>
  );
}
