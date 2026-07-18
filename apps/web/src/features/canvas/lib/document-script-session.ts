/**
 * Session bridge so the canvas agent bus / CLI can read & write the open
 * document's script without threading React state through the bus.
 */
import type { AtmosCanvasScript } from "@/api/rest-api";

import type {
  CanvasDocumentScriptBundle,
  DocumentScriptStatus,
} from "./document-script-host";
import { getDocumentScriptHost } from "./document-script-host";

type SessionApi = {
  getScript: () => AtmosCanvasScript | null;
  setScript: (script: AtmosCanvasScript | null) => Promise<void>;
};

let session: SessionApi | null = null;

export function registerDocumentScriptSession(api: SessionApi | null) {
  session = api;
}

export function getDocumentScriptSession(): SessionApi | null {
  return session;
}

export function getLiveDocumentScriptStatus(): DocumentScriptStatus {
  return getDocumentScriptHost().getStatus();
}

export async function applyDocumentScriptBundle(
  script: AtmosCanvasScript | null,
): Promise<DocumentScriptStatus> {
  const host = getDocumentScriptHost();
  if (!script || !script.files || Object.keys(script.files).length === 0) {
    await host.start(null);
    return host.getStatus();
  }
  const bundle: CanvasDocumentScriptBundle = {
    entry: script.entry || "main.js",
    files: script.files,
  };
  await host.start(bundle);
  return host.getStatus();
}
