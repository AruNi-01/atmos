import { PlatformColor, type ColorValue } from "react-native";
import type { NativeStackHeaderItem } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";
import { isOpaqueGlassTint } from "@/ui/navigation/home-header-glass";

/**
 * Stable ids so iOS 26 can match the same bar button across navigation
 * transitions and animate the glass group instead of replacing it.
 * Tab switches use separate navigation bars, so they do not get this match.
 */
const SETTINGS_HEADER_ITEM_ID = "settings";
const SESSION_FILTER_HEADER_ITEM_ID = "session-filter";
const WORKSPACE_FILTER_HEADER_ITEM_ID = "workspace-filter";

/**
 * Navbar tint. A static near-white paints iOS 26 glass gray; semantic label
 * keeps the back chevron light without that fill. Other platforms keep the
 * app label, which is the icon color there.
 */
export function navigationBarTint(tintColor: string): ColorValue {
  if (process.env.EXPO_OS === "ios" && isOpaqueGlassTint(tintColor)) {
    return PlatformColor("label");
  }
  return tintColor;
}

export function settingsHeaderItem(onPress: () => void, tintColor: string): NativeStackHeaderItem {
  return {
    accessibilityLabel: "Settings",
    icon: { type: "sfSymbol", name: "gearshape" satisfies SFSymbol },
    identifier: SETTINGS_HEADER_ITEM_ID,
    label: "",
    onPress,
    sharesBackground: true,
    tintColor: navigationBarTint(tintColor),
    type: "button",
    variant: "plain",
  };
}

function filterHeaderItem(
  identifier: string,
  onPress: () => void,
  tintColor: string,
): NativeStackHeaderItem {
  return {
    accessibilityLabel: "Filter",
    icon: { type: "sfSymbol", name: "line.3.horizontal.decrease" satisfies SFSymbol },
    identifier,
    label: "",
    onPress,
    sharesBackground: true,
    tintColor: navigationBarTint(tintColor),
    type: "button",
    variant: "plain",
  };
}

export function workspaceFilterHeaderItem(
  onPress: () => void,
  tintColor: string,
): NativeStackHeaderItem {
  return filterHeaderItem(WORKSPACE_FILTER_HEADER_ITEM_ID, onPress, tintColor);
}

export function sessionFilterHeaderItem(
  onPress: () => void,
  tintColor: string,
): NativeStackHeaderItem {
  return filterHeaderItem(SESSION_FILTER_HEADER_ITEM_ID, onPress, tintColor);
}

/**
 * Session home/bucket right-bar items. Same order as Workspace:
 * Filter, then Settings, so Filter sits to the left of Settings.
 */
export function sessionHeaderRightItems(
  onFilter: () => void,
  onSettings: () => void,
  tintColor: string,
): NativeStackHeaderItem[] {
  return [sessionFilterHeaderItem(onFilter, tintColor), settingsHeaderItem(onSettings, tintColor)];
}
