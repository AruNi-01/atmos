import { Pressable, Text, View } from "react-native";
import { Stack } from "expo-router";
import { MobileAgentIcon } from "@/features/terminal/MobileAgentIcon";
import { SESSION_AGENT_NONE, sessionAgentLabel } from "@/features/sessions/session-agent-filter";
import { useSessionAgentCatalog } from "@/features/sessions/use-session-agent-catalog";
import { useSessionInboxStore } from "@/stores/session-inbox-store";
import { useMobileTheme } from "@/theme/theme-store";
import { typography } from "@/theme/typography";
import { BotIcon, CheckIcon } from "@/ui/icons/lucide-native";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { Separator } from "@/ui/layout/row";
import { nativeCompactTitleOptions } from "@/ui/navigation/native-screen-options";
import { ListSkeleton } from "@/ui/primitives/list-skeleton";

export function SessionFilterScreen() {
  const theme = useMobileTheme();
  const catalog = useSessionAgentCatalog();
  const agentIds = useSessionInboxStore((state) => state.agentIds);
  const clearAgents = useSessionInboxStore((state) => state.clearAgents);
  const toggleAgent = useSessionInboxStore((state) => state.toggleAgent);
  const choices = (catalog.data ?? []).map((agent) => ({
    id: agent.id,
    label: agent.label.trim() || sessionAgentLabel(agent.id),
  }));
  const allOn = agentIds.length === 0;
  const catalogError = catalog.error instanceof Error ? catalog.error.message : null;

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeCompactTitleOptions("Filter", theme.colors),
          headerShadowVisible: false,
          headerStyle: { backgroundColor: "transparent" },
          headerTransparent: true,
        }}
      />
      <AppScreen surface="sheet">
        <Section label="Agent">
          {catalog.isLoading && choices.length === 0 ? (
            <ListSkeleton />
          ) : choices.length === 0 ? (
            <EmptyState layout="section" message="Nothing to filter yet." title="None" />
          ) : (
            <>
              <FilterChoiceRow label="All" onPress={clearAgents} selected={allOn} />
              {choices.map((choice) => (
                <View key={choice.id}>
                  <Separator />
                  <FilterChoiceRow
                    agentId={choice.id === SESSION_AGENT_NONE ? null : choice.id}
                    label={choice.label}
                    onPress={() => toggleAgent(choice.id)}
                    selected={agentIds.includes(choice.id)}
                  />
                </View>
              ))}
            </>
          )}
        </Section>
        <InlineError message={catalogError} />
      </AppScreen>
    </>
  );
}

function FilterChoiceRow({
  agentId,
  label,
  onPress,
  selected,
}: {
  agentId?: string | null;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const theme = useMobileTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) =>
        pressed ? { backgroundColor: theme.colors.mutedPressed } : undefined
      }
    >
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: 12,
          minHeight: 52,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        {agentId === undefined ? (
          <BotIcon color={theme.colors.secondaryLabel} size={18} strokeWidth={2.2} />
        ) : (
          <MobileAgentIcon agentId={agentId ?? ""} size={18} />
        )}
        <Text
          numberOfLines={1}
          style={[typography.rowTitle, { color: theme.colors.label, flex: 1 }]}
        >
          {label}
        </Text>
        {selected ? <CheckIcon color={theme.colors.accent} size={18} strokeWidth={2.6} /> : null}
      </View>
    </Pressable>
  );
}
