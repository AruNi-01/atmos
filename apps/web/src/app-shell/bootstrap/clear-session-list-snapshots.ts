/**
 * Clear session list snapshots on Atmos Computer / connection target switch.
 * Same lifecycle as APP-043 surface cache clear — must not leak across computers.
 */
export async function clearSessionListSnapshotsOnTargetChange(): Promise<void> {
  const { clearSessionListSnapshots } = await import(
    "@/features/workspace/store/session-list-snapshot-store"
  );
  clearSessionListSnapshots();
}
