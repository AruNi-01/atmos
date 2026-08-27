export type MdLiveEmbedLayout = "inline" | "card";

export type MdLiveEmbedSpec = {
  kind: string;
  layout: MdLiveEmbedLayout;
  title: string;
  attrs: Record<string, string>;
};
