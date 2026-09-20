import {
  getMdLiveEditor,
  waitForMdLiveEditor,
  type MdLiveEditorApi,
} from "./md-live-editor-registry";

/** Resolve the mounted Live editor, switching to Live if the caller asks. Never locks. */
export async function resolveMdLiveRunEditor(options: {
  filePath: string;
  ensureLive?: () => void;
  getEditor?: (path: string) => MdLiveEditorApi | null;
  waitForEditor?: (path: string) => Promise<MdLiveEditorApi | null>;
}): Promise<MdLiveEditorApi | null> {
  const get = options.getEditor ?? getMdLiveEditor;
  const existing = get(options.filePath);
  if (existing) return existing;
  options.ensureLive?.();
  const wait = options.waitForEditor ?? waitForMdLiveEditor;
  return wait(options.filePath);
}
