import "@/global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppProviders } from "@/providers/AppProviders";
import { colors } from "@/theme/colors";

export default function RootLayout() {
  const isIos = process.env.EXPO_OS === "ios";
  const sheetPresentation = isIos ? "formSheet" : "modal";

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <AppProviders>
        <Stack
          screenOptions={{
            headerLargeTitle: isIos,
            headerTransparent: isIos,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: isIos ? "transparent" : colors.background },
            headerTintColor: colors.label,
            headerTitleStyle: { color: colors.label, fontWeight: "700" },
            headerLargeTitleStyle: { color: colors.label, fontWeight: "800" },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: "Atmos" }} />
          <Stack.Screen name="onboarding" options={{ title: "Connect Atmos" }} />
          <Stack.Screen name="settings" options={{ title: "Settings", presentation: "modal" }} />
          <Stack.Screen
            name="import-project"
            options={{
              title: "Import Project",
              presentation: sheetPresentation,
              sheetGrabberVisible: isIos,
              contentStyle: { backgroundColor: isIos ? "transparent" : colors.background },
            }}
          />
          <Stack.Screen
            name="create-workspace"
            options={{
              title: "New Workspace",
              presentation: sheetPresentation,
              sheetGrabberVisible: isIos,
              contentStyle: { backgroundColor: isIos ? "transparent" : colors.background },
            }}
          />
          <Stack.Screen
            name="workspace/[workspaceId]"
            options={{
              title: "Workspace",
              headerBackButtonDisplayMode: "minimal",
              headerLargeTitle: false,
            }}
          />
          <Stack.Screen name="+not-found" options={{ title: "Not Found" }} />
        </Stack>
        <StatusBar style="dark" />
      </AppProviders>
    </GestureHandlerRootView>
  );
}
