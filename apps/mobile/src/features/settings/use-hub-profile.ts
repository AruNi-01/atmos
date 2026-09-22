import { useHubProfileStore } from "@/stores/hub-profile-store";

/** Cached Hub profile. Refreshed when the app opens, not when Settings mounts. */
export function useHubProfile(enabled: boolean) {
  const profile = useHubProfileStore((state) => state.profile);
  return {
    data: enabled ? profile : null,
    error: null as Error | null,
  };
}
