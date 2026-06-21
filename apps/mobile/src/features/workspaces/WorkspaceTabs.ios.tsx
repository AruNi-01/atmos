import { StyleSheet, View } from "react-native";
import { Host, RNHostView, TabView } from "@expo/ui/swift-ui";
import { tabViewStyle } from "@expo/ui/swift-ui/modifiers";
import { useMobileTheme } from "@/theme/theme-store";
import type { WorkspaceTab, WorkspaceTabsProps } from "./WorkspaceTabs.types";

export function WorkspaceTabs({ items, onSelectTab, selectedTab }: WorkspaceTabsProps) {
  const theme = useMobileTheme();

  return (
    <Host colorScheme={theme.colorScheme} style={styles.host}>
      <TabView
        modifiers={[tabViewStyle({ type: "automatic" })]}
        onSelectionChange={(value) => {
          if (isWorkspaceTab(value)) onSelectTab(value);
        }}
        selection={selectedTab}
      >
        {items.map((item) => (
          <TabView.Tab
            key={item.value}
            label={item.label}
            systemImage={item.iosSystemImage}
            value={item.value}
          >
            <RNHostView>
              <View style={styles.page}>{item.children}</View>
            </RNHostView>
          </TabView.Tab>
        ))}
      </TabView>
    </Host>
  );
}

function isWorkspaceTab(value: string): value is WorkspaceTab {
  return value === "terminal" || value === "changes" || value === "overview";
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
