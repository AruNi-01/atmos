import { Stack, useRouter } from "expo-router";
import { WorkspaceListScreen } from "@/features/workspaces/WorkspaceListScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { NativeButton } from "@/ui/primitives/native-controls";

export default function IndexRoute() {
  const router = useRouter();

  return (
    <>
      <WorkspaceListScreen />
      <Stack.Screen
        options={{
          ...nativeLargeTitleOptions("Atmos"),
          headerRight: () => (
            <NativeButton label="Settings" onPress={() => router.push("/settings")} variant="text" />
          ),
        }}
      />
    </>
  );
}
