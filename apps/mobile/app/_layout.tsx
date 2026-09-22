import "@/global.css";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppProviders } from "@/providers/AppProviders";
import { useMobileTheme } from "@/theme/theme-store";

function navigationTheme(isDark: boolean, background: string, text: string, border: string, primary: string): Theme {
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background,
      border,
      card: background,
      notification: base.colors.notification,
      primary,
      text,
    },
  };
}

export default function RootLayout() {
  const theme = useMobileTheme();
  const isIos = process.env.EXPO_OS === "ios";
  const sheetPresentation = isIos ? "formSheet" : "modal";
  const screenContentStyle = { backgroundColor: theme.colors.background };
  const sheetContentStyle = { backgroundColor: theme.colors.sheetBackground };

  const navigation = navigationTheme(
    theme.isDark,
    theme.colors.background,
    theme.colors.label,
    theme.colors.separator,
    theme.colors.label,
  );

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <AppProviders>
        <ThemeProvider value={navigation}>
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerTintColor: theme.colors.label,
            contentStyle: screenContentStyle,
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen
            name="settings"
            options={{
              contentStyle: sheetContentStyle,
              headerShown: false,
              presentation: sheetPresentation,
              // System radius so the half detent stays inset, matching the filter
              // sheet. A fixed radius draws the bottom corners outside the phone.
              sheetCornerRadius: -1,
              sheetGrabberVisible: isIos,
              sheetLargestUndimmedDetentIndex: "none",
              ...(isIos
                ? {
                    sheetAllowedDetents: [0.5, 1],
                    sheetInitialDetentIndex: 1,
                    sheetExpandsWhenScrolledToEdge: true,
                  }
                : null),
            }}
          />
          <Stack.Screen
            name="sign-in"
            options={{
              // Fill tracks the dock (light: near-black, dark: elevated card).
              contentStyle: {
                backgroundColor: theme.isDark
                  ? theme.colors.cardElevated
                  : "#0a0a0b",
                flex: 1,
              },
              headerShown: false,
              presentation: sheetPresentation,
              sheetCornerRadius: 32,
              sheetGrabberVisible: isIos,
              sheetLargestUndimmedDetentIndex: "none",
              // Single large detent — sheet fills the stack height.
              ...(isIos
                ? {
                    sheetAllowedDetents: [1],
                    sheetInitialDetentIndex: 0,
                    sheetExpandsWhenScrolledToEdge: false,
                  }
                : null),
            }}
          />
          <Stack.Screen
            name="computer-connect"
            options={{
              presentation: sheetPresentation,
              sheetGrabberVisible: isIos,
              contentStyle: sheetContentStyle,
            }}
          />
          <Stack.Screen
            name="workspace-filters"
            options={{
              contentStyle: sheetContentStyle,
              headerShown: false,
              presentation: sheetPresentation,
              sheetCornerRadius: 32,
              sheetGrabberVisible: isIos,
              ...(isIos
                ? {
                    sheetAllowedDetents: [1],
                    sheetInitialDetentIndex: 0,
                  }
                : null),
            }}
          />
          <Stack.Screen
            name="workspaces"
            options={{
              presentation: sheetPresentation,
              sheetGrabberVisible: isIos,
              contentStyle: sheetContentStyle,
            }}
          />
          <Stack.Screen
            name="create-workspace"
            options={{
              presentation: sheetPresentation,
              sheetGrabberVisible: isIos,
              contentStyle: sheetContentStyle,
            }}
          />
          <Stack.Screen
            name="workspace/[workspaceId]"
            options={{
              headerBackButtonDisplayMode: "minimal",
            }}
          />
          <Stack.Screen
            name="preview"
            options={{
              headerBackButtonDisplayMode: "minimal",
            }}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style={theme.statusBarStyle} />
        </ThemeProvider>
      </AppProviders>
    </GestureHandlerRootView>
  );
}
