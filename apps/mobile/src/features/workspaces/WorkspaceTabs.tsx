import { StyleSheet, View } from "react-native";
import { NativeSegmentedControl } from "@/ui/primitives/native-controls";
import { spacing } from "@/theme/spacing";
import type { WorkspaceTabsProps } from "./WorkspaceTabs.types";

export function WorkspaceTabs({
  bottomInset,
  items,
  onSelectTab,
  selectedTab,
}: WorkspaceTabsProps) {
  const activeItem = items.find((item) => item.value === selectedTab) ?? items[0];

  return (
    <View style={styles.root}>
      <View style={styles.content}>{activeItem?.children}</View>
      <View style={[styles.footer, { paddingBottom: Math.max(bottomInset, spacing.screenFooterBottom) }]}>
        <NativeSegmentedControl
          onValueChange={onSelectTab}
          options={items.map((item) => ({ label: item.label, value: item.value }))}
          selectedValue={selectedTab}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.screenFooterTop,
  },
  root: {
    flex: 1,
  },
});
