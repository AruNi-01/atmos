"use client";

import { useEffect, useMemo } from "react";
import { MdLiveEditor } from "@atmos/md-live/ui";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useEditorSettingsStore } from "@/features/settings/store/editor-settings-store";
import { MdLiveSelectionToolbar } from "./MdLiveSelectionToolbar";
import { MdLiveSlashMenu } from "./MdLiveSlashMenu";
import {
  mdLiveEmbedBlock,
  mdLiveEmbedBlockView,
  mdLiveEmbedInline,
  mdLiveEmbedInlineView,
  mdLiveRemarkDirective,
} from "../lib/md-live-embed-plugin";
import { insertMdLiveMedia } from "../lib/md-live-media-insert";
import { mdLiveMediaViewPlugin } from "../lib/md-live-media-plugin";
import { mdLivePreviewBlockPlugins } from "../lib/md-live-preview-blocks";
import {
  emitMdLiveEditorEvent,
  getMdLiveEditor,
  registerMdLiveEditor,
  unregisterMdLiveEditor,
} from "../lib/md-live-editor-registry";
import { copyMdLivePrompt } from "../lib/md-live-adapters";
import { mdLiveCopy } from "../lib/md-live-copy";

export function MarkdownLiveEditor({
  filePath,
  value,
  onChange,
  onSave,
  className,
}: {
  filePath: string;
  value: string;
  onChange: (markdown: string) => void;
  onSave?: () => void;
  className?: string;
}) {
  const workspaceRoot = useEditorStore((state) => state.currentProjectPath);
  const mdToggleDefaultOpen = useEditorSettingsStore((state) => state.mdToggleDefaultOpen);
  const extraPlugins = useMemo(
    () => [
      mdLiveRemarkDirective,
      mdLiveEmbedBlock,
      mdLiveEmbedInline,
      mdLiveEmbedBlockView,
      mdLiveEmbedInlineView,
      mdLiveMediaViewPlugin(filePath, workspaceRoot),
      ...mdLivePreviewBlockPlugins(),
    ],
    [filePath, workspaceRoot],
  );

  useEffect(() => {
    getMdLiveEditor(filePath)?.setToggleDefaultOpen(mdToggleDefaultOpen);
  }, [filePath, mdToggleDefaultOpen]);

  return (
    <MdLiveEditor
      value={value}
      onChange={onChange}
      onSave={onSave}
      className={className}
      copy={mdLiveCopy}
      slashMenu={MdLiveSlashMenu}
      selectionToolbar={MdLiveSelectionToolbar}
      extraPlugins={extraPlugins}
      defaultToggleOpen={mdToggleDefaultOpen}
      onOpenMedia={(kind) => {
        void insertMdLiveMedia({
          kind,
          documentPath: filePath,
          workspaceRoot,
        }).then((markdown) => {
          if (!markdown) return;
          getMdLiveEditor(filePath)?.insertMarkdown(markdown);
        });
      }}
      onReady={(handle) => registerMdLiveEditor(filePath, handle)}
      onDispose={(handle) => unregisterMdLiveEditor(filePath, handle)}
      onAiAction={(kind, selection) => {
        emitMdLiveEditorEvent(filePath, { type: "ai-action", kind, selection });
      }}
      onStreamEnded={() => {
        emitMdLiveEditorEvent(filePath, { type: "stream-ended" });
      }}
      onStreamAborted={() => {
        emitMdLiveEditorEvent(filePath, { type: "stream-aborted" });
      }}
      onCopyPrompt={() => {
        const api = getMdLiveEditor(filePath);
        if (!api) return;
        const selection = api.getSelectionMarkdown();
        if (!selection.trim()) return;
        void copyMdLivePrompt({
          instruction: "",
          document: { path: filePath, markdown: api.getMarkdown(), truncated: false },
          selection: { markdown: selection },
          references: [],
          execution: { kind: "copy" },
          outputHint: "markdown",
        });
      }}
    />
  );
}
