import {
  isMdLiveDocumentTool,
  isMdLiveMutatingTool,
  MD_LIVE_MUTATING_TOOLS,
  MD_LIVE_READ_TOOLS,
  splitMarkdownStreamChunks,
} from "@atmos/md-live";
import type { MdLiveEditorApi } from "./md-live-editor-registry";
import { getMdLiveEditor } from "./md-live-editor-registry";
import {
  lockMdLiveStream,
  restoreAndUnlockMdLiveStream,
  unlockMdLiveStream,
} from "./md-live-stream-lock";

export type MdLiveAgentToolResult = {
  success: boolean;
  data?: Record<string, unknown>;
  error_code?: string;
  error_message?: string;
  recoverable?: boolean;
};

export type MdLiveStreamApi = Pick<
  MdLiveEditorApi,
  | "getMarkdown"
  | "getSelectionMarkdown"
  | "selectAll"
  | "startStream"
  | "pushChunk"
  | "endStream"
  | "abortStream"
  | "acceptAllDiffs"
  | "clearDiffReview"
>;

function argMarkdown(args: Record<string, unknown>): string | null {
  const value = args.markdown ?? args.text ?? args.content;
  return typeof value === "string" ? value : null;
}

function snapshot(api: MdLiveStreamApi, filePath: string, clientId: string) {
  return {
    path: filePath,
    markdown: api.getMarkdown(),
    selection: api.getSelectionMarkdown(),
    client_id: clientId,
  };
}

export async function streamMarkdownIntoLive(
  api: MdLiveStreamApi,
  markdown: string,
  insertAt: "cursor" | "selection",
): Promise<boolean> {
  if (!api.startStream(insertAt)) {
    api.abortStream(false);
    if (!api.startStream(insertAt)) return false;
  }
  for (const chunk of splitMarkdownStreamChunks(markdown)) {
    api.pushChunk(chunk);
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve());
        return;
      }
      setTimeout(resolve, 0);
    });
  }
  api.endStream(true);
  return true;
}

export async function applyMdLiveAgentTool(options: {
  api: MdLiveStreamApi;
  tool: string;
  args: Record<string, unknown>;
  filePath: string;
  clientId: string;
}): Promise<MdLiveAgentToolResult> {
  const { api, tool, args, filePath, clientId } = options;
  if (!isMdLiveDocumentTool(tool)) {
    return {
      success: false,
      error_code: "UNKNOWN_TOOL",
      error_message: `Unknown Live tool ${tool}. Use md_live_get or a document-edit tool.`,
      recoverable: false,
    };
  }
  if (tool === "md_live_tools_list") {
    return {
      success: true,
      data: { tools: [...MD_LIVE_READ_TOOLS, ...MD_LIVE_MUTATING_TOOLS] },
    };
  }
  if (tool === "md_live_get") {
    return { success: true, data: snapshot(api, filePath, clientId) };
  }
  if (!isMdLiveMutatingTool(tool)) {
    return {
      success: false,
      error_code: "UNKNOWN_TOOL",
      error_message: `Tool ${tool} cannot change the Live document.`,
      recoverable: false,
    };
  }
  const markdown = argMarkdown(args);
  if (markdown == null) {
    return {
      success: false,
      error_code: "VALIDATION_ARG",
      error_message: "args.markdown must be a string",
      recoverable: false,
    };
  }
  lockMdLiveStream(filePath, api.getMarkdown());
  try {
    if (tool === "md_live_replace_document") api.selectAll();
    const insertAt = tool === "md_live_insert" ? "cursor" : "selection";
    const started = await streamMarkdownIntoLive(api, markdown, insertAt);
    if (!started) {
      unlockMdLiveStream(filePath);
      return {
        success: false,
        error_code: "STREAM_BUSY",
        error_message: "Live is already streaming another edit. Retry in a moment.",
        recoverable: true,
      };
    }
    return { success: true, data: snapshot(api, filePath, clientId) };
  } catch (error) {
    unlockMdLiveStream(filePath);
    throw error;
  }
}

export function finishMdLiveEditReview(options: {
  filePath: string;
  accept: boolean;
  write?: (content: string) => void;
  api?: MdLiveStreamApi | null;
}): boolean {
  const api = options.api ?? getMdLiveEditor(options.filePath);
  if (options.accept) {
    api?.acceptAllDiffs();
    unlockMdLiveStream(options.filePath);
    return true;
  }
  api?.abortStream(false);
  api?.clearDiffReview();
  if (options.write) {
    return restoreAndUnlockMdLiveStream(options.filePath, options.write);
  }
  unlockMdLiveStream(options.filePath);
  return true;
}

export async function applyMdLiveAgentToolToOpenDoc(options: {
  tool: string;
  args: Record<string, unknown>;
  filePath: string;
  clientId: string;
}): Promise<MdLiveAgentToolResult> {
  const api = getMdLiveEditor(options.filePath);
  if (!api) {
    return {
      success: false,
      error_code: "MD_LIVE_BRIDGE_OFFLINE",
      error_message: "The Live editor is not mounted for this file.",
      recoverable: true,
    };
  }
  return applyMdLiveAgentTool({ ...options, api });
}
