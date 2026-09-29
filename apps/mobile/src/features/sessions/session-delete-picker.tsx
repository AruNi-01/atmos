import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";
import { NativePicker } from "@/ui/primitives/native-controls";
import { type SessionDeleteChoice } from "./session-row-actions";

const OPTIONS: Array<{ label: string; value: SessionDeleteChoice }> = [
  { label: "Atmos Chat and native chat", value: "both" },
  { label: "Atmos Chat", value: "chat" },
  { label: "Native chat", value: "native" },
];

export function SessionDeletePicker({
  busy,
  error,
  isPresented,
  onConfirm,
  onDismiss,
}: {
  busy?: boolean;
  error?: string | null;
  isPresented: boolean;
  onConfirm: (choice: SessionDeleteChoice) => void;
  onDismiss: () => void;
}) {
  const theme = useMobileTheme();
  const [choice, setChoice] = useState<SessionDeleteChoice>("both");

  useEffect(() => {
    if (isPresented) setChoice("both");
  }, [isPresented]);

  return (
    <ExpoDrawer
      isPresented={isPresented}
      matchContents
      onDismiss={onDismiss}
      snapPoints={[{ height: 280 }]}
    >
      <View style={{ gap: 16 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: theme.colors.label, fontSize: 17, fontWeight: "600" }}>
            Delete session
          </Text>
          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 }}>
            Choose what to delete. The session leaves this list either way.
          </Text>
        </View>
        <NativePicker
          onValueChange={(value) => setChoice(value)}
          options={OPTIONS}
          selectedValue={choice}
        />
        {error ? (
          <Text style={{ color: theme.colors.red, fontSize: 13, lineHeight: 18 }}>{error}</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => onConfirm(choice)}
          style={{
            alignItems: "center",
            backgroundColor: theme.colors.red,
            borderRadius: radii.card,
            opacity: busy ? 0.6 : 1,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "600" }}>Delete</Text>
        </Pressable>
      </View>
    </ExpoDrawer>
  );
}
