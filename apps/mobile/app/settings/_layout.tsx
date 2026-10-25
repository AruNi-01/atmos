import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from "expo-router";
import { useMobileTheme } from "@/theme/theme-store";

function sheetTheme(isDark: boolean, sheet: string, text: string, border: string): Theme {
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: sheet,
      border,
      card: sheet,
      primary: text,
      text,
    },
  };
}

export default function SettingsLayout() {
  const theme = useMobileTheme();
  const navigation = sheetTheme(
    theme.isDark,
    theme.colors.sheetBackground,
    theme.colors.label,
    theme.colors.separator,
  );

  return (
    <ThemeProvider value={navigation}>
      <Stack
        screenOptions={{
          // Keep page fill on contentStyle only — do not set headerStyle /
          // headerLargeStyle background on this stack. Large-title routes
          // (Settings index) disappear on iOS 26 when those are forced.
          // iOS stays clear. The navigation theme above is the sheet color,
          // so no second rectangle sits in the corners.
          contentStyle: { backgroundColor: theme.colors.sheetBackground },
          headerTransparent: true,
          headerShadowVisible: false,
          headerTintColor: theme.colors.label,
          headerTitleStyle: { color: theme.colors.label },
        }}
      />
    </ThemeProvider>
  );
}
