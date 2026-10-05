import type { NativeStackHeaderItem } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";

const TERMINAL_NEW_HEADER_ITEM_ID = "terminal-new";

function terminalHeaderButton(
  id: string,
  accessibilityLabel: string,
  symbol: SFSymbol,
  onPress: () => void,
  tintColor: string,
): NativeStackHeaderItem {
  return {
    accessibilityLabel,
    icon: { type: "sfSymbol", name: symbol },
    identifier: id,
    label: "",
    onPress,
    sharesBackground: true,
    tintColor,
    type: "button",
    variant: "plain",
  };
}

/** Trailing edge, matching the home settings button. */
export function newTerminalHeaderItem(onCreate: () => void, tintColor: string) {
  return terminalHeaderButton(TERMINAL_NEW_HEADER_ITEM_ID, "New terminal", "plus", onCreate, tintColor);
}

export function terminalHeaderRightItems(onCreate: () => void, tintColor: string) {
  return [newTerminalHeaderItem(onCreate, tintColor)];
}
