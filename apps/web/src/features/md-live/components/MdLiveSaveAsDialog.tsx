"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@workspace/ui";
import { ensureMarkdownExtension, joinWorktreePath } from "../lib/md-live-save-as";
import { pathExistsInDir, suggestedUntitledName } from "../lib/md-live-save-as-fs";

export function MdLiveSaveAsDialog({
  open,
  defaultDirectory,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  defaultDirectory: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (fullPath: string) => Promise<void>;
}) {
  const t = useTranslations("mdLive");
  const [directory, setDirectory] = useState(defaultDirectory);
  const [fileName, setFileName] = useState("Untitled.md");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDirectory(defaultDirectory);
    setError(null);
    void suggestedUntitledName(defaultDirectory)
      .then(setFileName)
      .catch(() => setFileName("Untitled.md"));
  }, [open, defaultDirectory]);

  const submit = async () => {
    const name = ensureMarkdownExtension(fileName);
    const dir = directory.trim() || defaultDirectory;
    try {
      const exists = await pathExistsInDir(dir, name);
      if (exists) {
        const suggestion = await suggestedUntitledName(dir);
        setFileName(suggestion);
        setError(t("fileExists"));
        return;
      }
      setSaving(true);
      await onConfirm(joinWorktreePath(dir, name));
      onOpenChange(false);
    } catch {
      setError(t("saveAsFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("saveAs")}</DialogTitle>
          <DialogDescription>{t("fileName")}</DialogDescription>
        </DialogHeader>
        <label className="block text-sm">
          <span className="text-muted-foreground">{t("directory")}</span>
          <Input
            className="mt-1"
            value={directory}
            onChange={(event) => setDirectory(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">{t("fileName")}</span>
          <Input
            className="mt-1"
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="button" disabled={saving} onClick={() => void submit()}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
