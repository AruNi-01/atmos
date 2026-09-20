"use client";

import { useTranslations } from "next-intl";
import { FindPanel } from "./FindPanel";

export function MarkdownFindPanel({
  open,
  root,
  focusNonce,
  onClose,
}: {
  open: boolean;
  root: HTMLElement | null;
  focusNonce: number;
  onClose: () => void;
}) {
  const t = useTranslations("Editor.components");
  return (
    <FindPanel
      open={open}
      root={root}
      focusNonce={focusNonce}
      seedFromSelection
      placeholder={t("searchPanel.findInFile")}
      onClose={onClose}
    />
  );
}
