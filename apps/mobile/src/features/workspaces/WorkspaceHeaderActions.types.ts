import type { ImageSourcePropType } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import type { TerminalHeaderControls } from "@/features/terminal/TerminalScreen";
import type { WorkspaceTab } from "./WorkspaceTabs.types";

export type WorkspaceHeaderActionTab = {
  androidIcon: ImageSourcePropType;
  iosSystemImage: SFSymbol;
  label: string;
  value: WorkspaceTab;
};

export type WorkspaceHeaderActionsProps = {
  onSelectTab: (tab: WorkspaceTab) => void;
  selectedTab: WorkspaceTab;
  tabs: WorkspaceHeaderActionTab[];
  terminalControls: TerminalHeaderControls | null;
};

export const NEW_TERMINAL_ACTION_ID = "__new-terminal";

export function isWorkspaceTab(value: string): value is WorkspaceTab {
  return value === "terminal" || value === "changes" || value === "overview";
}

export function handleTerminalAction(actionId: string, controls: TerminalHeaderControls | null) {
  if (!controls) return;
  if (actionId === NEW_TERMINAL_ACTION_ID) {
    controls.onCreateEntry();
    return;
  }
  controls.onSelectEntry(actionId);
}
