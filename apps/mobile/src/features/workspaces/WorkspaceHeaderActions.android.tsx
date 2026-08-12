import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import { radii } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import {
  handleTerminalAction,
  isWorkspaceTab,
  NEW_TERMINAL_ACTION_ID,
  type WorkspaceHeaderActionsProps,
} from "./WorkspaceHeaderActions.types";

export function WorkspaceHeaderActions({
  onSelectTab,
  selectedTab,
  tabs,
  terminalControls,
}: WorkspaceHeaderActionsProps) {
  const theme = useMobileTheme();
  const activeTab = tabs.find((tab) => tab.value === selectedTab) ?? tabs[0];
  const viewActions: MenuAction[] = tabs.map((tab) => ({
    id: tab.value,
    image: tab.androidIcon,
    state: tab.value === selectedTab ? "on" : "off",
    title: tab.label,
  }));
  const terminalActions: MenuAction[] = terminalControls
    ? [
        ...terminalControls.entries.map<MenuAction>((entry) => ({
          id: entry.id,
          image: require("../../../assets/icons/terminal.xml"),
          state: entry.id === terminalControls.activeEntryId ? "on" : "off",
          title: entry.label,
        })),
        {
          id: NEW_TERMINAL_ACTION_ID,
          title: "New Terminal",
        },
      ]
    : [
        {
          id: "loading",
          title: "Loading",
          attributes: { disabled: true },
        },
      ];

  return (
    <View
      style={[
        styles.group,
        {
          backgroundColor: theme.colors.glassFallbackStrong,
          borderColor: theme.colors.glassBorder,
          borderRadius: radii.pill,
        },
      ]}
    >
      <MenuView
        actions={viewActions}
        onPressAction={(event) => {
          const actionId = event.nativeEvent.event;
          if (isWorkspaceTab(actionId)) onSelectTab(actionId);
        }}
      >
        <Pressable hitSlop={8} style={styles.action}>
          {activeTab ? (
            <Image source={activeTab.androidIcon} style={[styles.icon, { tintColor: theme.colors.label }]} />
          ) : null}
        </Pressable>
      </MenuView>
      <View style={[styles.separator, { backgroundColor: theme.colors.separator }]} />
      <MenuView
        actions={terminalActions}
        onPressAction={(event) => handleTerminalAction(event.nativeEvent.event, terminalControls)}
      >
        <Pressable disabled={!terminalControls} hitSlop={8} style={[styles.action, !terminalControls && styles.disabled]}>
          <Text style={[styles.ellipsis, { color: theme.colors.label }]}>…</Text>
        </Pressable>
      </MenuView>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    height: 34,
    justifyContent: "center",
    width: 42,
  },
  disabled: {
    opacity: 0.45,
  },
  ellipsis: {
    ...typography.controlLabel,
    fontSize: 19,
    marginTop: -4,
  },
  group: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    overflow: "hidden",
  },
  icon: {
    height: 20,
    width: 20,
  },
  separator: {
    height: 20,
    width: StyleSheet.hairlineWidth,
  },
});
