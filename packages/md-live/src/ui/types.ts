export const MD_LIVE_HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type MdLiveHeadingLevel = (typeof MD_LIVE_HEADING_LEVELS)[number];

export type MdLiveBlockAction =
  | { type: "paragraph" }
  | { type: "heading"; level: MdLiveHeadingLevel }
  | { type: "bullet-list" }
  | { type: "ordered-list" }
  | { type: "task-list" }
  | { type: "quote" }
  | { type: "code" }
  | { type: "inline-code" }
  | { type: "bold" }
  | { type: "italic" }
  | { type: "strikethrough" }
  | { type: "table" }
  | { type: "divider" };

export type MdLiveAiActionKind = "ask" | "rewrite" | "summarize";

export type MdLiveMediaOpenKind = "image" | "video" | "audio" | "file";

export type MdLiveSlashPick =
  | { kind: "block"; action: MdLiveBlockAction }
  | { kind: "markdown"; markdown: string }
  | { kind: "text"; text: string }
  | { kind: "open"; open: MdLiveMediaOpenKind };

export type MdLiveEditorHandle = {
  getMarkdown: () => string;
  getSelectionMarkdown: () => string;
  insertMarkdown: (markdown: string, options?: { replaceSlash?: boolean }) => void;
  insertText: (text: string, options?: { replaceSlash?: boolean }) => void;
  runBlockAction: (action: MdLiveBlockAction) => void;
  startStream: (insertAt: "cursor" | "selection") => boolean;
  pushChunk: (token: string) => void;
  endStream: (diffReview?: boolean) => void;
  abortStream: (keep?: boolean) => void;
  acceptAllDiffs: () => void;
  clearDiffReview: () => void;
};

export type MdLiveCopyFn = (key: string) => string;

export type MdLiveSlashMenuProps = {
  query: string;
  onPick: (pick: MdLiveSlashPick) => void;
  copy?: MdLiveCopyFn;
};

export type MdLiveSelectionToolbarProps = {
  onBlock: (action: MdLiveBlockAction) => void;
  onCopy: () => void;
  onAi?: (kind: MdLiveAiActionKind) => void;
  onCopyPrompt?: () => void;
  copy?: MdLiveCopyFn;
};

export type MdLiveTaskMarker = " " | "x" | "/" | "-";
