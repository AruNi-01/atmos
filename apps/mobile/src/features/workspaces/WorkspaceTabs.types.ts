import type { ReactElement } from "react";
import type { ImageSourcePropType } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

export type WorkspaceTab = "terminal" | "changes" | "overview";

export type WorkspaceTabItem = {
  androidIcon: ImageSourcePropType;
  children: ReactElement;
  iosSystemImage: SFSymbol;
  label: string;
  value: WorkspaceTab;
};

export type WorkspaceTabsProps = {
  bottomInset: number;
  items: WorkspaceTabItem[];
  onSelectTab: (tab: WorkspaceTab) => void;
  selectedTab: WorkspaceTab;
};
