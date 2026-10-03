import { ScrollView, Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";
import { AgentChatEventBody } from "./AgentChatEventBody";
import type { SheetFrame } from "./event-model";

export function AgentChatDetailSheet({
  onDismiss,
  sheets,
}: {
  onDismiss: () => void;
  sheets: SheetFrame[];
}) {
  const theme = useMobileTheme();
  const page = sheets[0];
  if (!page) return null;

  return (
    <ExpoDrawer
      isPresented
      matchContents={false}
      onDismiss={onDismiss}
      snapPoints={["half", "full"]}
    >
      <View style={{ flex: 1, gap: 12 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.label, fontSize: 17, fontWeight: "600" }}>
          {page.model.title}
        </Text>
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 12 }} style={{ flex: 1 }}>
          <AgentChatEventBody model={page.model} />
        </ScrollView>
      </View>
    </ExpoDrawer>
  );
}
