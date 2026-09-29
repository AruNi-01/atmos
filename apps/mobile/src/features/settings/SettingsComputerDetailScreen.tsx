import { Button, Host } from "@expo/ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMobileSettingsController } from "@/features/settings/use-mobile-settings-controller";
import { FieldBlock } from "@/features/settings/settings-shared";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { NativeTextInput } from "@/ui/primitives/native-controls";
import { expoUiButtonStretchModifiers } from "@/ui/primitives/expo-ui-button-modifiers";
import { expoUiButtonHostStyle, expoUiPrimaryStyle } from "@/ui/primitives/expo-ui-button-styles";

export function SettingsComputerDetailScreen() {
  const theme = useMobileTheme();
  const params = useLocalSearchParams<{ serverId?: string }>();
  const settings = useMobileSettingsController();
  const serverId = typeof params.serverId === "string" ? params.serverId : null;
  const computer =
    settings.activeComputers.find((row) => row.server_id === serverId) ?? null;
  const [name, setName] = useState(computer?.display_name ?? "");
  const prefilledServerId = useRef<string | null>(null);
  const trimmed = name.trim();
  const renameDisabled = !serverId || settings.renameComputer.isPending || trimmed.length === 0;
  const renameStyle = expoUiPrimaryStyle(theme.colors, renameDisabled);

  useEffect(() => {
    if (!computer) return;
    if (prefilledServerId.current === computer.server_id) return;
    prefilledServerId.current = computer.server_id;
    setName(computer.display_name ?? "");
  }, [computer]);

  if (!computer || !serverId) {
    return (
      <AppScreen surface="sheet">
        <EmptyState title="Computer not found" message="Go back and pick a Computer." />
      </AppScreen>
    );
  }

  return (
    <AppScreen surface="sheet">
      <View style={{ gap: 20 }}>
        <FieldBlock label="Name">
          <NativeTextInput onChangeText={setName} placeholder="Computer name" value={name} />
        </FieldBlock>
        <Text style={[typography.rowSubtitle, { color: theme.colors.secondaryLabel, paddingHorizontal: 4 }]}>
          {computer.server_id}
        </Text>
        <Host
          colorScheme={theme.colorScheme}
          matchContents={{ vertical: true }}
          seedColor={renameStyle.seedColor}
          style={expoUiButtonHostStyle}
        >
          <Button
            disabled={renameDisabled}
            label={settings.renameComputer.isPending ? "Saving..." : "Save name"}
            modifiers={expoUiButtonStretchModifiers}
            onPress={
              renameDisabled
                ? undefined
                : () => settings.renameComputer.mutate({ serverId, displayName: trimmed })
            }
            style={renameStyle.style}
            variant={renameStyle.variant}
          />
        </Host>
        <Section>
          <Pressable
            accessibilityRole="button"
            disabled={settings.revokeComputer.isPending}
            onPress={() => settings.confirmRevokeComputer(serverId)}
            style={({ pressed }) =>
              pressed ? { backgroundColor: theme.colors.mutedPressed } : undefined
            }
          >
            <View style={{ alignItems: "center", justifyContent: "center", minHeight: 52, paddingHorizontal: 16 }}>
              <Text style={[typography.rowTitle, { color: theme.colors.red }]}>
                {settings.revokeComputer.isPending ? "Revoking..." : "Revoke Computer"}
              </Text>
            </View>
          </Pressable>
        </Section>
        <InlineError message={settings.error} />
      </View>
    </AppScreen>
  );
}
