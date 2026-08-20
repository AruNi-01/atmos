/**
 * tldraw LicenseProvider (internal) renders a hidden
 * `[data-testid="tl-license-expired"]` node after 5s when the license is
 * `expired` or `unlicensed-production`. The editor children are unmounted —
 * Atmos is left with an empty `bg-background` shell unless we detect this.
 */
export const TLDRAW_LICENSE_EXPIRED_TEST_ID = "tl-license-expired";

export const TLDRAW_LICENSE_EXPIRED_SELECTOR = `[data-testid="${TLDRAW_LICENSE_EXPIRED_TEST_ID}"]`;

export function hostHasTldrawLicenseGate(host: ParentNode | null | undefined): boolean {
  return Boolean(host?.querySelector(TLDRAW_LICENSE_EXPIRED_SELECTOR));
}
