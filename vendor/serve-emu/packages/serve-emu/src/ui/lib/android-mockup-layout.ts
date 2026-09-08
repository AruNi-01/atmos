export type FittedAndroidMockup = {
  screenWidth: number;
  screenHeight: number;
  isLandscape: boolean;
  isTablet: boolean;
};

const MIN_SCREEN_WIDTH = 80;
const PHONE_FRAME_DESIGN = 1080;
const LANDSCAPE_FRAME_DESIGN = 2340;
const TAB_FRAME_DESIGN = 1600;
const FRAME_THICKNESS = 32;

export function isAndroidTabletScreen(width: number, height: number): boolean {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  if (short <= 0 || long <= 0) return false;
  return short / long >= 0.6;
}

function frameThickness(screenWidth: number, design: number): number {
  return Math.max(Math.floor((screenWidth * FRAME_THICKNESS) / design), 1);
}

function outerSize(
  screenWidth: number,
  screenHeight: number,
  isLandscape: boolean,
  isTablet: boolean,
): { width: number; height: number } {
  const design = isTablet
    ? TAB_FRAME_DESIGN
    : isLandscape
      ? LANDSCAPE_FRAME_DESIGN
      : PHONE_FRAME_DESIGN;
  const frame = frameThickness(screenWidth, design);
  const extra = Math.floor(frame * 0.9) - Math.floor(frame / 2) + 1;
  return {
    width: screenWidth + frame * 2 + (isLandscape ? 0 : extra),
    height: screenHeight + frame * 2 + (isLandscape ? extra : 0),
  };
}

export function fitAndroidMockupScreen(
  availableWidth: number,
  availableHeight: number,
  deviceWidth: number,
  deviceHeight: number,
): FittedAndroidMockup {
  const width = Math.max(1, deviceWidth);
  const height = Math.max(1, deviceHeight);
  const isLandscape = width > height;
  const isTablet = isAndroidTabletScreen(width, height);
  const aspect = height / width;
  const maxWidth = Math.max(MIN_SCREEN_WIDTH, Math.floor(Math.max(0, availableWidth)));
  let lo = MIN_SCREEN_WIDTH;
  let hi = maxWidth;
  let best = MIN_SCREEN_WIDTH;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const screenHeight = Math.max(1, Math.round(mid * aspect));
    const outer = outerSize(mid, screenHeight, isLandscape, isTablet);
    if (outer.width <= availableWidth && outer.height <= availableHeight) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return {
    screenWidth: best,
    screenHeight: Math.max(1, Math.round(best * aspect)),
    isLandscape,
    isTablet,
  };
}
