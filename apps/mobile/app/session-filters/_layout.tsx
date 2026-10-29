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

export default function SessionFiltersLayout() {
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
          contentStyle: { backgroundColor: theme.colors.sheetBackground },
          headerTransparent: true,
          headerShadowVisible: false,
          headerTintColor: theme.colors.label,
        }}
      />
    </ThemeProvider>
  );
}
