import { Stack, useRouter } from "expo-router";
import { AppScreen, EmptyState } from "@/ui/layout/app-screen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { ExpoUiButton } from "@/ui/primitives/native-controls";
import { useMobileTheme } from "@/theme/theme-store";

export default function NotFoundRoute() {
  const router = useRouter();
  const theme = useMobileTheme();

  return (
    <>
      <AppScreen>
        <EmptyState title="Route not found" message="This mobile screen does not exist." />
        <ExpoUiButton label="Back to Workspaces" onPress={() => router.replace("/")} />
      </AppScreen>
      <Stack.Screen options={nativeLargeTitleOptions("Not Found", theme.colors)} />
    </>
  );
}
