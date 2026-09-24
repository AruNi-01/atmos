import type { NativeStackHeaderItem } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";

/**
 * Stable ids so iOS 26 can match the same bar button across navigation
 * transitions and animate the glass group instead of replacing it.
 * Tab switches use separate navigation bars, so they do not get this match.
 */
const SETTINGS_HEADER_ITEM_ID = "settings";
const WORKSPACE_FILTER_HEADER_ITEM_ID = "workspace-filter";

export function settingsHeaderItem(onPress: () => void, tintColor: string): NativeStackHeaderItem {
  return {
    accessibilityLabel: "Settings",
    icon: { type: "sfSymbol", name: "gearshape" satisfies SFSymbol },
    identifier: SETTINGS_HEADER_ITEM_ID,
    label: "",
    onPress,
    sharesBackground: true,
    tintColor,
    type: "button",
    variant: "plain",
  };
}

export function workspaceFilterHeaderItem(onPress: () => void, tintColor: string): NativeStackHeaderItem {
  return {
    accessibilityLabel: "Filter",
    icon: { type: "sfSymbol", name: "line.3.horizontal.decrease" satisfies SFSymbol },
    identifier: WORKSPACE_FILTER_HEADER_ITEM_ID,
    label: "",
    onPress,
    sharesBackground: true,
    tintColor,
    type: "button",
    variant: "plain",
  };
}
