import "@/global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppProviders } from "@/providers/AppProviders";
import { useMobileTheme } from "@/theme/theme-store";

export default function RootLayout() {
  const theme = useMobileTheme();
  const isIos = process.env.EXPO_OS === "ios";
  const sheetPresentation = isIos ? "formSheet" : "modal";

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <AppProviders>
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerTintColor: theme.colors.label,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="settings" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen
            name="computer-connect"
            options={{
              presentation: sheetPresentation,
              sheetGrabberVisible: isIos,
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
          <Stack.Screen
            name="workspaces"
            options={{
              presentation: sheetPresentation,
              sheetGrabberVisible: isIos,
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
          <Stack.Screen
            name="import-project"
            options={{
              presentation: sheetPresentation,
              sheetGrabberVisible: isIos,
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
          <Stack.Screen
            name="create-workspace"
            options={{
              presentation: sheetPresentation,
              sheetGrabberVisible: isIos,
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
          <Stack.Screen
            name="workspace/[workspaceId]"
            options={{
              headerBackButtonDisplayMode: "minimal",
            }}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style={theme.statusBarStyle} />
      </AppProviders>
    </GestureHandlerRootView>
  );
}
