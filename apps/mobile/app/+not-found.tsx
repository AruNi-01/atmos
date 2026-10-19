import { useEffect } from "react";
import { radii } from "@/theme/radii";
import { LogBox, Platform } from "react-native";
import { Button, Host } from "@expo/ui";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { controlSize, frame } from "@expo/ui/swift-ui/modifiers";
import { Stack, usePathname, useRouter } from "expo-router";
import { AppScreen, EmptyState } from "@/ui/layout/app-screen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { useMobileTheme } from "@/theme/theme-store";

// Fixed string, no path. Release keeps error-level console output in os_log.
// Dev LogBox would otherwise cover this screen; the native log still fires.
LogBox.ignoreLogs(["ATMOS_ROUTE unmatched"]);

const buttonStretchModifiers = Platform.select({
  ios: [frame({ maxWidth: Number.POSITIVE_INFINITY }), controlSize("large")],
  android: [fillMaxWidth()],
  default: undefined,
});

export default function NotFoundRoute() {
  const router = useRouter();
  const theme = useMobileTheme();
  const pathname = usePathname();
  useEffect(() => {
    console.error("ATMOS_ROUTE unmatched");
  }, [pathname]);

  return (
    <>
      <AppScreen>
        <EmptyState title="Route not found" message="This mobile screen does not exist." />
        <Host
          matchContents={{ vertical: true }}
          colorScheme={theme.colorScheme}
          seedColor={theme.colors.ctaFill}
          style={{ alignSelf: "stretch", width: "100%" }}
        >
          <Button
            label={"Back to Workspaces"}
            onPress={() => router.replace("/")}
            modifiers={buttonStretchModifiers}
            style={{
              backgroundColor: theme.colors.ctaFill,
              borderRadius: radii.control,
              height: 52,
              paddingHorizontal: 22,
            }}
            variant="filled"
          />
        </Host>
      </AppScreen>
      <Stack.Screen options={nativeLargeTitleOptions("Not Found", theme.colors)} />
    </>
  );
}
