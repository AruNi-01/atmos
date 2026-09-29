import type { ReactNode } from "react";

export type SessionSwipeRowProps = {
  archiveLabel?: string;
  backgroundColor: string;
  children: ReactNode;
  deleteLabel?: string;
  onArchive?: () => void;
  onDelete?: () => void;
  onPin: () => void;
  pinLabel: string;
};
