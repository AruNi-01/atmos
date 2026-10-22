import type { ReactNode } from "react";

export type SessionSwipeRowProps = {
  archiveLabel?: string;
  children: ReactNode;
  deleteLabel?: string;
  onArchive?: () => void;
  onDelete?: () => void;
  /** Row activation. The swipe row calls this only for a stationary tap while the actions are hidden. */
  onPress?: () => void;
  /** Visual open state, including while the row is still moving. Not a gesture decision. */
  onRevealedChange?: (open: boolean) => void;
  onPin: () => void;
  pinLabel: string;
};
