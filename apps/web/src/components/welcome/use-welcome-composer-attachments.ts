"use client";

import React from "react";
import type { ComposerAttachment } from "@/components/welcome/AttachmentBar";
import type { ComposerHandle } from "@/components/welcome/PromptComposer";

export function useWelcomeComposerAttachments(
  composerRef: React.RefObject<ComposerHandle | null>,
) {
  const [attachments, setAttachments] = React.useState<ComposerAttachment[]>([]);
  const attachmentCounterRef = React.useRef(0);
  const [previewAttachment, setPreviewAttachment] = React.useState<ComposerAttachment | null>(null);

  const clearAttachments = React.useCallback(() => {
    setAttachments((prev) => {
      prev.forEach((attachment) => URL.revokeObjectURL(attachment.objectUrl));
      return [];
    });
    attachmentCounterRef.current = 0;
  }, []);

  const handleAttachmentRemove = React.useCallback(
    (id: string) => {
      const target = attachments.find((attachment) => attachment.id === id);
      if (target) {
        composerRef.current?.removeImagePlaceholder(target.number);
      }
    },
    [attachments, composerRef],
  );

  const handleImagePaste = React.useCallback(
    (blob: Blob, ext: string) => {
      attachmentCounterRef.current += 1;
      const number = attachmentCounterRef.current;
      const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "") || "png";
      const filename = `img-${number}.${safeExt}`;
      const attachment: ComposerAttachment = {
        id: `img-${number}`,
        number,
        ext: safeExt,
        filename,
        blob,
        objectUrl: URL.createObjectURL(blob),
      };
      setAttachments((prev) => [...prev, attachment]);
      composerRef.current?.insertImagePlaceholder(number);
    },
    [composerRef],
  );

  const syncAttachmentPlaceholders = React.useCallback((text: string) => {
    const present = new Set<number>();
    for (const match of text.matchAll(/\[#img-(\d+)\]/g)) {
      present.add(Number(match[1]));
    }
    setAttachments((prev) => {
      if (prev.every((attachment) => present.has(attachment.number))) return prev;
      const survivors = prev.filter((attachment) => present.has(attachment.number));
      prev.forEach((attachment) => {
        if (!survivors.some((survivor) => survivor.id === attachment.id)) {
          URL.revokeObjectURL(attachment.objectUrl);
        }
      });
      return survivors;
    });
  }, []);

  return {
    attachments,
    clearAttachments,
    handleAttachmentRemove,
    handleImagePaste,
    previewAttachment,
    setPreviewAttachment,
    syncAttachmentPlaceholders,
  };
}
