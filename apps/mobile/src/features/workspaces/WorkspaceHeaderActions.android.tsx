import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import { colors } from "@/theme/colors";
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
    <View style={styles.group}>
      <MenuView
        actions={viewActions}
        onPressAction={(event) => {
          const actionId = event.nativeEvent.event;
          if (isWorkspaceTab(actionId)) onSelectTab(actionId);
        }}
      >
        <Pressable hitSlop={8} style={styles.action}>
          {activeTab ? <Image source={activeTab.androidIcon} style={styles.icon} /> : null}
        </Pressable>
      </MenuView>
      <View style={styles.separator} />
      <MenuView
        actions={terminalActions}
        onPressAction={(event) => handleTerminalAction(event.nativeEvent.event, terminalControls)}
      >
        <Pressable disabled={!terminalControls} hitSlop={8} style={[styles.action, !terminalControls && styles.disabled]}>
          <Text style={styles.ellipsis}>...</Text>
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
    color: colors.label,
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: -4,
  },
  group: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.86)",
    borderColor: colors.glassBorder,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    overflow: "hidden",
  },
  icon: {
    height: 20,
    tintColor: colors.label,
    width: 20,
  },
  separator: {
    backgroundColor: colors.separator,
    height: 20,
    width: StyleSheet.hairlineWidth,
  },
});
