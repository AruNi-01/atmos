import { StyleSheet, View } from "react-native";
import { Host, Icon, NavigationBar, NavigationBarItem, Text } from "@expo/ui/jetpack-compose";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { spacing } from "@/theme/spacing";
import { useMobileTheme } from "@/theme/theme-store";
import type { WorkspaceTabsProps } from "./WorkspaceTabs.types";

export function WorkspaceTabs({
  bottomInset,
  items,
  onSelectTab,
  selectedTab,
}: WorkspaceTabsProps) {
  const theme = useMobileTheme();
  const activeItem = items.find((item) => item.value === selectedTab) ?? items[0];
  const navigationItemColors = {
    selectedIconColor: theme.colors.label,
    selectedIndicatorColor: theme.colors.mutedPressed,
    selectedTextColor: theme.colors.label,
    unselectedIconColor: theme.colors.secondaryLabel,
    unselectedTextColor: theme.colors.secondaryLabel,
  };

  return (
    <View style={styles.root}>
      <View style={styles.content}>{activeItem?.children}</View>
      <View style={[styles.navigationFrame, { paddingBottom: Math.max(bottomInset, spacing.screenFooterBottom) }]}>
        <Host colorScheme={theme.colorScheme} matchContents={{ vertical: true }} seedColor={theme.colors.label} style={styles.host}>
          <NavigationBar
            containerColor={theme.colors.glassFallbackStrong}
            contentColor={theme.colors.label}
            modifiers={[fillMaxWidth()]}
            tonalElevation={0}
          >
            {items.map((item) => {
              const selected = item.value === selectedTab;
              const itemColor = selected ? theme.colors.label : theme.colors.secondaryLabel;
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

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  host: {
    width: "100%",
  },
  navigationFrame: {
    paddingHorizontal: spacing.screenFooterBottom,
    paddingTop: spacing.screenFooterTop,
  },
  root: {
    flex: 1,
  },
});
