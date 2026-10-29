export type MdLiveEditOp =
  | { type: "replace_selection"; markdown: string }
  | { type: "insert"; markdown: string }
  | { type: "replace_document"; markdown: string };

export type MdLiveEditContext = {
  markdown: string;
  selectionStart: number;
  selectionEnd: number;
};

export const MD_LIVE_MUTATING_TOOLS = [
  "md_live_replace_selection",
  "md_live_insert",
  "md_live_replace_document",
] as const;

export const MD_LIVE_READ_TOOLS = ["md_live_get", "md_live_tools_list"] as const;

export type MdLiveMutatingTool = (typeof MD_LIVE_MUTATING_TOOLS)[number];
export type MdLiveReadTool = (typeof MD_LIVE_READ_TOOLS)[number];
export type MdLiveDocumentTool = MdLiveMutatingTool | MdLiveReadTool;

export type MdLiveViewportRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};
