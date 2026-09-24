import { createContext, useContext } from "react";

/**
 * Extra scroll-content padding while the floating home tab bar is on screen.
 * The bar overlays the page, so this only keeps the last row scrollable above it.
 */
export const HomeTabBarInsetContext = createContext(0);

export function useHomeTabBarInset() {
  return useContext(HomeTabBarInsetContext);
}
