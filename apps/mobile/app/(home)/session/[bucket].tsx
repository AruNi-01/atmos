import { useLocalSearchParams } from "expo-router";
import { SessionBucketScreen } from "@/features/sessions/SessionInboxScreen";

export default function SessionBucketRoute() {
  const { bucket } = useLocalSearchParams<{ bucket: string }>();
  const raw = Array.isArray(bucket) ? bucket[0] : bucket;
  return <SessionBucketScreen bucket={raw} />;
}
