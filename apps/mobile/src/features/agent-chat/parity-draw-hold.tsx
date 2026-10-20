import { createContext, useContext } from "react";

/**
 * Null in the product. A capture hold sets 0..1 so the tree stroke stays at
 * that fraction until the screenshot returns.
 */
export const ParityDrawHoldContext = createContext<number | null>(null);

export function useParityDrawHold(): number | null {
  return useContext(ParityDrawHoldContext);
}
