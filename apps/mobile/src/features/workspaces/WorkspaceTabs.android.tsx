import { StyleSheet, View } from "react-native";
import { Host, Icon, NavigationBar, NavigationBarItem, Text } from "@expo/ui/jetpack-compose";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { colors } from "@/theme/colors";
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
      <View style={[styles.navigationFrame, { paddingBottom: Math.max(bottomInset, 8) }]}>
        <Host colorScheme="light" matchContents={{ vertical: true }} seedColor={colors.label} style={styles.host}>
          <NavigationBar
            containerColor="rgba(255, 255, 255, 0.92)"
            contentColor={colors.label}
            modifiers={[fillMaxWidth()]}
            tonalElevation={0}
          >
            {items.map((item) => {
              const selected = item.value === selectedTab;
              const itemColor = selected ? colors.label : colors.secondaryLabel;
              return (
                <NavigationBarItem
                  colors={navigationItemColors}
                  key={item.value}
                  onClick={() => onSelectTab(item.value)}
                  selected={selected}
                >
                  <NavigationBarItem.Icon>
                    <Icon source={item.androidIcon} size={23} tint={itemColor} />
                  </NavigationBarItem.Icon>
                  <NavigationBarItem.Label>
                    <Text color={itemColor} style={{ typography: "labelMedium" }}>
                      {item.label}
                    </Text>
                  </NavigationBarItem.Label>
                </NavigationBarItem>
              );
            })}
          </NavigationBar>
        </Host>
      </View>
    </View>
  );
}

const navigationItemColors = {
  selectedIconColor: colors.label,
  selectedIndicatorColor: "rgba(10, 10, 11, 0.1)",
  selectedTextColor: colors.label,
  unselectedIconColor: colors.secondaryLabel,
  unselectedTextColor: colors.secondaryLabel,
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  host: {
    width: "100%",
  },
  navigationFrame: {
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  root: {
    flex: 1,
  },
});
