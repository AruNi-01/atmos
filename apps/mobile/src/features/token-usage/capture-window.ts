/**
 * Nav bar plus the soft fade that continues past it.
 * The scroll-edge effect is drawn on the scroll view, so a slice that starts at
 * y 0 is blurred. This clearance is measured from the top of the screen.
 */
const TOP_FADE_CLEARANCE = 44 + 64;

export function captureSliceWindow(
  lead: number,
  scrollY: number,
  safeTop: number,
  viewportHeight: number,
): { baseShift: number; topCrop: number; windowHeight: number } {
  const obscured = Math.max(0, safeTop + TOP_FADE_CLEARANCE - scrollY);
  const limit = Math.max(0, viewportHeight - 1);
  // `lead` is the expanded large-title band. When the page is scrolled that band
  // is gone and the fade sits on the content, so crop the fade and slide the page
  // down until its top clears it.
  const topCrop = Math.min(Math.max(lead, obscured, 0), limit);
  return {
    baseShift: topCrop - lead,
    topCrop,
    windowHeight: Math.max(1, viewportHeight - topCrop),
  };
}
