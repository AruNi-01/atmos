"use client";

import { useCallback, useEffect, useMemo, type ComponentType } from "react";
import { MdLiveEditor, type MdLiveCopyFn, type MdLiveSlashMenuProps } from "@atmos/md-live/ui";
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

function SlashMenuWithoutMedia(props: MdLiveSlashMenuProps) {
  return <MdLiveSlashMenu {...props} hiddenGroups={["media"]} />;
}

export function MarkdownLiveEditor({
  filePath,
  value,
  onChange,
  onSave,
  className,
  placeholder,
  readOnly = false,
  autoFocus = true,
  embedded = false,
  enableAi = true,
  enableMedia = true,
}: {
  filePath: string;
  value: string;
  onChange: (markdown: string) => void;
  onSave?: () => void;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  embedded?: boolean;
  enableAi?: boolean;
  enableMedia?: boolean;
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
  const copy = useCallback<MdLiveCopyFn>(
    (key) => {
      if (key === "placeholderEmptyLine" && placeholder) return placeholder;
      return mdLiveCopy(key);
    },
    [placeholder],
  );
  const slashMenu: ComponentType<MdLiveSlashMenuProps> = enableMedia
    ? MdLiveSlashMenu
    : SlashMenuWithoutMedia;

  useEffect(() => {
    getMdLiveEditor(filePath)?.setToggleDefaultOpen(mdToggleDefaultOpen);
  }, [filePath, mdToggleDefaultOpen]);

  return (
    <MdLiveEditor
      value={value}
      onChange={onChange}
      onSave={onSave}
      className={className}
      copy={copy}
      slashMenu={slashMenu}
      selectionToolbar={MdLiveSelectionToolbar}
      extraPlugins={extraPlugins}
      defaultToggleOpen={mdToggleDefaultOpen}
      readOnly={readOnly}
      autoFocus={autoFocus}
      embedded={embedded}
      onOpenMedia={
        enableMedia
          ? (kind) => {
              void insertMdLiveMedia({
                kind,
                documentPath: filePath,
                workspaceRoot,
              }).then((markdown) => {
                if (!markdown) return;
                getMdLiveEditor(filePath)?.insertMarkdown(markdown);
              });
            }
          : undefined
      }
      onReady={(handle) => registerMdLiveEditor(filePath, handle)}
      onDispose={(handle) => unregisterMdLiveEditor(filePath, handle)}
      onAiAction={
        enableAi
          ? (kind, selection) => {
              emitMdLiveEditorEvent(filePath, { type: "ai-action", kind, selection });
            }
          : undefined
      }
      onStreamEnded={
        enableAi
          ? () => {
              emitMdLiveEditorEvent(filePath, { type: "stream-ended" });
            }
          : undefined
      }
      onStreamAborted={
        enableAi
          ? () => {
              emitMdLiveEditorEvent(filePath, { type: "stream-aborted" });
            }
          : undefined
      }
      onCopyPrompt={
        enableAi
          ? () => {
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
            }
          : undefined
      }
    />
  );
}
