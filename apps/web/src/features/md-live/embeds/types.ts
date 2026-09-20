import type { ComponentType, ReactNode } from "react";
import type { MdLiveEmbedLayout, MdLiveEmbedSpec } from "@atmos/md-live";
import type { MdLiveEmbedInsertKind } from "@atmos/md-live/ui";

export type MdLiveEmbedViewProps = {
  spec: MdLiveEmbedSpec;
  selected: boolean;
};

export type MdLiveEmbedDefinition = {
  kind: string;
  defaultLayout: MdLiveEmbedLayout;
  slash?: { id: string; label: string; keywords: string; embed: MdLiveEmbedInsertKind };
  View: ComponentType<MdLiveEmbedViewProps>;
};

export type MdLiveEmbedChromeProps = {
  layout: MdLiveEmbedLayout;
  selected: boolean;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeClassName?: string;
  loading?: boolean;
  canOpen: boolean;
  onOpen: () => void;
  tooltip?: string;
};
