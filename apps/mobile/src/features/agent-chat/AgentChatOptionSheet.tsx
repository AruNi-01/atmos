import { Pressable, ScrollView, Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { typography } from "@/theme/typography";
import { CheckIcon } from "@/ui/icons/lucide-native";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";

export function AgentChatOptionSheet(props: {
  choices: { id: string; label: string }[];
  extraChoices?: { id: string; label: string }[];
  extraSelectedId?: string | null;
  extraTitle?: string;
  onClose: () => void;
  onSelect: (choiceId: string) => void;
  onSelectExtra?: (choiceId: string) => void;
  selectedId: string | null;
  title: string;
  visible: boolean;
}) {
  const {
    choices,
    extraChoices,
    extraSelectedId,
    extraTitle,
    onClose,
    onSelect,
    onSelectExtra,
    selectedId,
    title,
    visible,
  } = props;
  const extras = extraChoices ?? [];

  return (
    <ExpoDrawer isPresented={visible} matchContents={false} onDismiss={onClose} snapPoints={["half", "full"]}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
        <ChoiceGroup
          choices={choices}
          onSelect={(choiceId) => {
            onSelect(choiceId);
            onClose();
          }}
          selectedId={selectedId}
          title={title}
        />
        {extras.length > 0 ? (
          <View style={{ marginTop: 18 }}>
            <ChoiceGroup
              choices={extras}
              onSelect={(choiceId) => {
                onSelectExtra?.(choiceId);
                onClose();
              }}
              selectedId={extraSelectedId ?? null}
              title={extraTitle ?? ""}
            />
          </View>
        ) : null}
      </ScrollView>
    </ExpoDrawer>
  );
}

function ChoiceGroup(props: {
  choices: { id: string; label: string }[];
  onSelect: (choiceId: string) => void;
  selectedId: string | null;
  title: string;
}) {
  const theme = useMobileTheme();
  const { choices, onSelect, selectedId, title } = props;
  if (choices.length === 0) return null;

  return (
    <View>
      <Text
        style={[
          typography.rowTitle,
          { color: theme.colors.label, paddingBottom: 8, paddingHorizontal: 4 },
        ]}
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: theme.colors.cardElevated,
          borderColor: theme.colors.glassBorder,
          borderCurve: "continuous",
          borderRadius: 24,
          borderWidth: 0.5,
          overflow: "hidden",
        }}
      >
        {choices.map((choice, index) => {
          const selected = choice.id === selectedId;
          return (
            <View key={`${choice.id}:${index}`}>
              {index > 0 ? (
                <View
                  style={{
                    backgroundColor: theme.colors.separator,
                    height: 0.5,
                    marginLeft: 16,
                  }}
                />
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onSelect(choice.id)}
                style={({ pressed }) => ({
                  alignItems: "center",
                  backgroundColor: pressed ? theme.colors.mutedPressed : "transparent",
                  flexDirection: "row",
                  gap: 12,
                  minHeight: 52,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                })}
              >
                <Text numberOfLines={2} style={[typography.rowTitle, { color: theme.colors.label, flex: 1 }]}>
                  {choice.label}
                </Text>
                {selected ? <CheckIcon color={theme.colors.accent} size={18} strokeWidth={2.6} /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
