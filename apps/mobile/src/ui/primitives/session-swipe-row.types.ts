import type { ReactNode } from "react";

export type SessionSwipeRowProps = {
  archiveLabel?: string;
  backgroundColor: string;
  children: ReactNode;
  deleteLabel?: string;
  onArchive?: () => void;
  onDelete?: () => void;
  /** Row activation. The swipe row calls this only for a stationary tap while the actions are hidden. */
  onPress?: () => void;
  onPin: () => void;
  pinLabel: string;
};
