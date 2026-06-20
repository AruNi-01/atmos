import { StyleSheet, View } from "react-native";
import { NativeSegmentedControl } from "@/ui/primitives/native-controls";
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
      <View style={[styles.footer, { paddingBottom: Math.max(bottomInset, 12) }]}>
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
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  root: {
    flex: 1,
  },
});
