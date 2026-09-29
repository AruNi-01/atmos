import { StyleSheet, Text } from "react-native";
import { GlassSurface } from "@rbayuokt/expo-adaptive-glass";
import type { TerminalWorkspaceChoice } from "@/features/terminal/TerminalScreen";
import { ChevronDownIcon } from "@/ui/icons/lucide-native";
import { IosPopover } from "@/ui/primitives/ios-popover";
import { PopoverActionList, PopoverActionRow } from "@/ui/primitives/popover-menu";
import { useMobileTheme } from "@/theme/theme-store";

export function WorkspaceSwitcherPopover({
  currentId,
  currentName,
  onSelect,
  workspaces,
}: {
  currentId: string;
  currentName: string;
  onSelect: (workspaceId: string) => void;
  workspaces: TerminalWorkspaceChoice[];
}) {
  const theme = useMobileTheme();

  return (
    <IosPopover direction="bottom">
      <IosPopover.Trigger>
        <GlassSurface
          accessibilityRole="button"
          cornerRadius={999}
          intensity={0.7}
          priority="high"
          style={styles.workspaceTrigger}
          tint="dark"
        >
          <Text numberOfLines={1} style={[styles.workspaceTriggerLabel, { color: theme.colors.terminalFg }]}>
            {currentName}
          </Text>
          <ChevronDownIcon color={theme.colors.terminalMuted} size={14} strokeWidth={2.4} />
        </GlassSurface>
      </IosPopover.Trigger>
      <IosPopover.Content style={{ backgroundColor: theme.colors.terminalElevated }}>
        <PopoverActionList>
          {workspaces.map((workspace) => (
            <PopoverActionRow
              key={workspace.id}
              label={workspace.name}
              onPress={() => onSelect(workspace.id)}
              selected={workspace.id === currentId}
              tone="terminal"
            />
          ))}
        </PopoverActionList>
      </IosPopover.Content>
    </IosPopover>
  );
}

const styles = StyleSheet.create({
  workspaceTrigger: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 4,
    maxWidth: 132,
    minHeight: 40,
    paddingHorizontal: 12,
  },
  workspaceTriggerLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
});
