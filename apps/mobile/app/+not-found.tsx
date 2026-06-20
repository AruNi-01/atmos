import { useRouter } from "expo-router";
import { AppScreen, EmptyState } from "@/ui/layout/app-screen";
import { NativeButton } from "@/ui/primitives/native-controls";

export default function NotFoundRoute() {
  const router = useRouter();
  return (
    <AppScreen>
      <EmptyState title="Route not found" message="This mobile screen does not exist." />
      <NativeButton label="Back to Workspaces" onPress={() => router.replace("/")} />
    </AppScreen>
  );
}
