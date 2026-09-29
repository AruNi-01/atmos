import type { NativeStackHeaderItem } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";

const TERMINAL_NEW_HEADER_ITEM_ID = "terminal-new";
const TERMINAL_LIST_HEADER_ITEM_ID = "terminal-list";

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

/**
 * First item is the trailing edge, matching the home settings/filter group.
 * Visual order is New, then the terminal list.
 */
export function newTerminalHeaderItem(onCreate: () => void, tintColor: string) {
  return terminalHeaderButton(TERMINAL_NEW_HEADER_ITEM_ID, "New terminal", "plus", onCreate, tintColor);
}

export function terminalHeaderRightItems(onCreate: () => void, onOpenList: () => void, tintColor: string) {
  return [
    terminalHeaderButton(
      TERMINAL_LIST_HEADER_ITEM_ID,
      "Terminal list",
      "square.grid.2x2",
      onOpenList,
      tintColor,
    ),
    terminalHeaderButton(TERMINAL_NEW_HEADER_ITEM_ID, "New terminal", "plus", onCreate, tintColor),
  ];
}
