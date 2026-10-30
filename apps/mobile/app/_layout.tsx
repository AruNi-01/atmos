import "@/global.css";
import {
  DarkTheme,
  DefaultTheme,
  Redirect,
  Stack,
  ThemeProvider,
  usePathname,
  type Theme,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { parityPreviewHref } from "@/features/agent-chat/parity-preview-route";
import { AppProviders } from "@/providers/AppProviders";
import { hiddenScrollEdgeEffects } from "@/ui/navigation/native-screen-options";
import { AndroidGlassRoot } from "@/ui/primitives/android-glass-root";
import { useMobileTheme } from "@/theme/theme-store";

function navigationTheme(
  isDark: boolean,
  background: string,
  text: string,
  border: string,
  primary: string,
): Theme {
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

export const unstable_settings = {
  initialRouteName: process.env.EXPO_PUBLIC_PARITY_PREVIEW === "1" ? "preview-chat" : "(home)",
};

function ParityPreviewRedirect() {
  const pathname = usePathname();
  const href = parityPreviewHref(process.env.EXPO_PUBLIC_PARITY_PREVIEW, pathname);
  if (href == null) return null;
  return <Redirect href={href} />;
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
          <AndroidGlassRoot>
            <Stack
              screenOptions={{
                headerShadowVisible: false,
                headerTintColor: theme.colors.label,
                contentStyle: screenContentStyle,
              }}
            >
              <Stack.Screen name="(home)" options={{ headerShown: false }} />
              <Stack.Screen
                name="quota-settings"
                options={{
                  contentStyle: sheetContentStyle,
                  presentation: sheetPresentation,
                  sheetCornerRadius: -1,
                  sheetGrabberVisible: isIos,
                  sheetLargestUndimmedDetentIndex: "none",
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
                name="settings"
                options={{
                  contentStyle: sheetContentStyle,
                  headerShown: false,
                  presentation: sheetPresentation,
                  // -1 is the system corner. 0 is square and leaves a border on a full sheet.
                  sheetCornerRadius: -1,
                  sheetGrabberVisible: isIos,
                  sheetLargestUndimmedDetentIndex: "none",
                  // Full height only. A half detent lets the sheet rest mid-screen.
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
                name="sign-in"
                options={{
                  // Fill tracks the dock (light: near-black, dark: elevated card).
                  contentStyle: {
                    backgroundColor: theme.isDark ? theme.colors.cardElevated : "#0a0a0b",
                    flex: 1,
                  },
                  headerShown: false,
                  presentation: sheetPresentation,
                  sheetCornerRadius: -1,
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
                name="session-filters"
                options={{
                  contentStyle: sheetContentStyle,
                  headerShown: false,
                  presentation: sheetPresentation,
                  sheetCornerRadius: -1,
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
                name="workspace-filters"
                options={{
                  contentStyle: sheetContentStyle,
                  headerShown: false,
                  presentation: sheetPresentation,
                  sheetCornerRadius: -1,
                  sheetGrabberVisible: isIos,
                  // -1 is the system corner. Omitting it becomes 0 and squares the full sheet.
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
                name="preview-chat"
                options={{ headerShown: false, scrollEdgeEffects: hiddenScrollEdgeEffects }}
              />
              <Stack.Screen name="+not-found" />
            </Stack>
            {process.env.EXPO_PUBLIC_PARITY_PREVIEW === "1" ? <ParityPreviewRedirect /> : null}
          </AndroidGlassRoot>
          <StatusBar style={theme.statusBarStyle} />
        </ThemeProvider>
      </AppProviders>
    </GestureHandlerRootView>
  );
}
