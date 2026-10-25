import type { ReactNode } from "react";

/** One circular action. Listed from the item toward the screen edge. */
export type SwipeRowAction = {
  color: string;
  icon: ReactNode;
  label: string;
  onPress: () => void;
};

export type SwipeRowProps = {
  children: ReactNode;
  /** Revealed by a right swipe. Omit it to keep that edge closed. */
  leading?: readonly SwipeRowAction[];
  /** Row activation. Called only for a stationary tap while the actions are hidden. */
  onPress?: () => void;
  /** Visual open state, including while the row is still moving. */
  onRevealedChange?: (open: boolean) => void;
  /** Bottom corners follow the grouped card. Set on the last row. */
  roundedBottom?: boolean;
  /** Top corners follow the grouped card. Set on the first row. */
  roundedTop?: boolean;
  /** Revealed by a left swipe. Omit it to keep that edge closed. */
  trailing?: readonly SwipeRowAction[];
};
