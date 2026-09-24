import { useCallback, useMemo } from "react";
import { Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { sessionBucketTitle } from "@/features/sessions/session-inbox";
import { useMobileTheme } from "@/theme/theme-store";
import { SettingsIcon } from "@/ui/icons/lucide-native";
import { settingsHeaderItem } from "@/ui/navigation/home-header-items";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function SessionTabStack() {
  const theme = useMobileTheme();
  const router = useRouter();
  const openSettings = useCallback(() => router.push("/settings"), [router]);
  const sessionTitleOptions = useMemo(
    () => nativeLargeTitleOptions("Session", theme.colors),
    [theme.colors],
  );
  const headerRightItems = useCallback(
    () => [settingsHeaderItem(openSettings, theme.colors.label)],
    [openSettings, theme.colors.label],
  );
  const screenOptions = useMemo(
    () => ({
      contentStyle: { backgroundColor: theme.colors.background },
      headerShadowVisible: false,
      headerShown: true,
      headerTintColor: theme.colors.label,
      ...(process.env.EXPO_OS === "ios"
        ? { unstable_headerRightItems: headerRightItems }
        : {
            headerLeft: () => (
              <Pressable
                accessibilityLabel="Settings"
                accessibilityRole="button"
                hitSlop={12}
                onPress={openSettings}
              >
                <SettingsIcon color={theme.colors.label} size={22} strokeWidth={2.2} />
              </Pressable>
            ),
          }),
    }),
    [headerRightItems, openSettings, theme.colors.background, theme.colors.label],
  );
  const bucketOptions = useCallback(
    ({ route }: { route: { params?: { bucket?: string | string[] } } }) => {
      const bucket = route.params?.bucket;
      const raw = Array.isArray(bucket) ? bucket[0] : bucket;
      return {
        ...sessionTitleOptions,
        // Previous-screen title ("Session") is applied after the push and flashes in.
        headerBackButtonDisplayMode: "minimal" as const,
        title: sessionBucketTitle(raw ?? ""),
      };
    },
    [sessionTitleOptions],
  );

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={sessionTitleOptions} />
      <Stack.Screen name="[bucket]" options={bucketOptions} />
    </Stack>
  );
}
