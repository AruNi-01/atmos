import { Stack, useLocalSearchParams } from "expo-router";
import { SessionBucketScreen } from "@/features/sessions/SessionInboxScreen";
import { sessionBucketTitle } from "@/features/sessions/session-inbox";
import { useMobileTheme } from "@/theme/theme-store";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function SessionBucketRoute() {
  const theme = useMobileTheme();
  const { bucket } = useLocalSearchParams<{ bucket: string }>();
  const raw = Array.isArray(bucket) ? bucket[0] : bucket;

  return (
    <>
      <Stack.Screen options={nativeLargeTitleOptions(sessionBucketTitle(raw ?? ""), theme.colors)} />
      <SessionBucketScreen bucket={raw} />
    </>
  );
}
