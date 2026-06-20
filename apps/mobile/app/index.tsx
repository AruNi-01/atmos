import { Stack, useRouter } from "expo-router";
import { WorkspaceListScreen } from "@/features/workspaces/WorkspaceListScreen";
import { NativeButton } from "@/ui/primitives/native-controls";

export default function IndexRoute() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen
        options={{
          title: "Atmos",
          headerRight: () => (
            <NativeButton label="Settings" onPress={() => router.push("/settings")} variant="text" />
          ),
        }}
      />
      <WorkspaceListScreen />
    </>
  );
}
