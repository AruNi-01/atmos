/**
 * APP-043 M12: clear warm/active surface frames on Atmos Computer / identity switch.
 * Extracted so unit tests can drive the shipped entry without full connection bootstrap.
 */
export async function clearWorkspaceSurfaceCacheOnTargetChange(): Promise<void> {
  const { useWorkspaceSurfaceCacheStore } = await import(
    "@/features/workspace/store/use-workspace-surface-cache-store"
  );
  useWorkspaceSurfaceCacheStore.getState().clearAll();
}
