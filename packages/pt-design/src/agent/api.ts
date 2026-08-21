import { writeFileSync } from "node:fs";
import {
  initDesignDocument,
  openDesignDocument,
  saveDesignDocument,
  type PtDesignFile,
} from "../core/document";
import { createPtDesignSession, type PtDesignSession } from "../core/session";
import { PT_ERROR_CODES, PtDesignError } from "./errors";
import { runSessionTool, type ToolCall } from "./session-tools";

export { runSessionTool, toNum, type ToolCall } from "./session-tools";

export type FileSession = {
  path: string | null;
  autoSave: boolean;
  doc: PtDesignFile;
  session: PtDesignSession;
};

export function openFileSession(options: {
  file?: string;
  create?: boolean;
  autoSave?: boolean;
}): FileSession {
  const autoSave = options.autoSave ?? true;
  if (!options.file) {
    const session = createPtDesignSession();
    return {
      path: null,
      autoSave,
      doc: {
        format: "pt-design-file/1",
        revision: 0,
        catalogVersion: "memory",
        excalidrawCompat: "0.18",
        scene: session.getScene(),
      },
      session,
    };
  }
  const doc = options.create
    ? initDesignDocument(options.file)
    : openDesignDocument(options.file);
  return {
    path: options.file,
    autoSave,
    doc,
    session: createPtDesignSession(doc.scene),
  };
}

function persist(fs: FileSession) {
  if (!fs.path || !fs.autoSave) return;
  fs.doc = saveDesignDocument(fs.path, {
    ...fs.doc,
    scene: fs.session.getScene(),
  });
}

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" ? v : undefined;
}

export function runTool(fs: FileSession, call: ToolCall): unknown {
  const { name, args } = call;
  switch (name) {
    case "pt_handoff": {
      const payload = runSessionTool(fs.session, call);
      const out = str(args, "out");
      if (out) writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
      persist(fs);
      return payload;
    }
    case "pt_doc_init": {
      const file = str(args, "file") ?? fs.path;
      if (!file) throw new PtDesignError(PT_ERROR_CODES.USAGE, "--file is required");
      const doc = initDesignDocument(file);
      fs.path = file;
      fs.doc = doc;
      fs.session.dispatch({ type: "replaceScene", scene: doc.scene });
      return { file, revision: doc.revision };
    }
    case "pt_doc_open": {
      const file = str(args, "file") ?? fs.path;
      if (!file) throw new PtDesignError(PT_ERROR_CODES.USAGE, "--file is required");
      const create = args.create === true;
      const next = openFileSession({ file, create, autoSave: fs.autoSave });
      fs.path = next.path;
      fs.doc = next.doc;
      fs.session.dispatch({ type: "replaceScene", scene: next.doc.scene });
      return { file, revision: next.doc.revision };
    }
    case "pt_doc_save": {
      if (!fs.path) throw new PtDesignError(PT_ERROR_CODES.USAGE, "--file is required");
      fs.doc = saveDesignDocument(fs.path, {
        ...fs.doc,
        scene: fs.session.getScene(),
      });
      return { file: fs.path, revision: fs.doc.revision };
    }
    default: {
      const result = runSessionTool(fs.session, call);
      persist(fs);
      return result;
    }
  }
}
