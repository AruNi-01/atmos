"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Copy, FileText, Loader2, MoreHorizontal } from "lucide-react";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
  toastManager,
} from "@workspace/ui";
import type { CanvasDocumentListItem } from "@/api/rest-api";

type DirtyAction = "switch" | "new";

export function CanvasDocumentsControl({
  title,
  fileName,
  dirty,
  documentList,
  canvasDir,
  isBusy,
  onRefreshList,
  onOpen,
  onNew,
  onSave,
  onSaveAs,
  onRename,
  onDelete,
  onDuplicate,
  className,
}: {
  title: string;
  fileName: string | null;
  dirty: boolean;
  documentList: CanvasDocumentListItem[];
  canvasDir?: string | null;
  isBusy?: boolean;
  onRefreshList: () => void | Promise<void>;
  onOpen: (fileName: string) => void | Promise<void>;
  onNew: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onSaveAs: (displayName: string) => void | Promise<void>;
  onRename: (fileName: string, name: string) => void | Promise<void>;
  onDelete: (fileName: string) => void | Promise<void>;
  onDuplicate: (fileName: string) => void | Promise<void>;
  className?: string;
}) {
  const t = useTranslations("Canvas.documents");
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<{
    action: DirtyAction;
    fileName?: string;
  } | null>(null);
  const [saveAsOpen, setSaveAsOpen] = React.useState(false);
  const [saveAsName, setSaveAsName] = React.useState("");
  const [saveAsAfter, setSaveAsAfter] = React.useState<"none" | DirtyAction | "open">("none");
  const [pendingOpenFile, setPendingOpenFile] = React.useState<string | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<string | null>(null);
  const [renameName, setRenameName] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [menuFor, setMenuFor] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      void onRefreshList();
    }
  }, [open, onRefreshList]);

  const displayTitle = dirty ? `${title} •` : title;

  const runOpen = React.useCallback(
    async (nextFile: string) => {
      setWorking(true);
      try {
        await onOpen(nextFile);
        setOpen(false);
        setPending(null);
        setSaveAsOpen(false);
      } finally {
        setWorking(false);
      }
    },
    [onOpen],
  );

  const runNew = React.useCallback(async () => {
    setWorking(true);
    try {
      await onNew();
      setOpen(false);
      setPending(null);
      setSaveAsOpen(false);
    } finally {
      setWorking(false);
    }
  }, [onNew]);

  const requestOpen = (nextFile: string) => {
    if (nextFile === fileName) {
      setOpen(false);
      return;
    }
    if (dirty) {
      setPending({ action: "switch", fileName: nextFile });
      return;
    }
    void runOpen(nextFile);
  };

  const requestNew = () => {
    if (dirty) {
      setPending({ action: "new" });
      return;
    }
    void runNew();
  };

  const handleDirtySave = async () => {
    if (!pending) return;
    setWorking(true);
    try {
      if (!fileName) {
        setSaveAsAfter(pending.action === "switch" ? "open" : pending.action);
        setPendingOpenFile(pending.fileName ?? null);
        setSaveAsName(title === "Untitled" ? "" : title);
        setSaveAsOpen(true);
        setPending(null);
        return;
      }
      await onSave();
      if (pending.action === "switch" && pending.fileName) {
        await runOpen(pending.fileName);
      } else if (pending.action === "new") {
        await runNew();
      }
    } catch {
      // parent surfaces errors
    } finally {
      setWorking(false);
    }
  };

  const handleDirtyDiscard = async () => {
    if (!pending) return;
    if (pending.action === "switch" && pending.fileName) {
      await runOpen(pending.fileName);
    } else {
      await runNew();
    }
  };

  const confirmSaveAs = async () => {
    const name = saveAsName.trim();
    if (!name) return;
    setWorking(true);
    try {
      await onSaveAs(name);
      if (saveAsAfter === "open" && pendingOpenFile) {
        await runOpen(pendingOpenFile);
      } else if (saveAsAfter === "new") {
        await runNew();
      } else {
        setOpen(false);
      }
      setSaveAsOpen(false);
      setSaveAsAfter("none");
      setPendingOpenFile(null);
    } catch {
      // parent surfaces
    } finally {
      setWorking(false);
    }
  };

  const copyPath = async (itemFile: string) => {
    const base = canvasDir?.replace(/\/$/, "") ?? "";
    const full = itemFile
      ? base
        ? `${base}/${itemFile}`
        : itemFile
      : base || itemFile;
    try {
      await navigator.clipboard.writeText(full);
      toastManager.add({
        title: t("copiedTitle"),
        description: full,
        type: "success",
      });
    } catch {
      toastManager.add({
        title: t("copiedTitle"),
        description: t("copyFailed"),
        type: "error",
      });
    }
    setMenuFor(null);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 max-w-[200px] gap-1.5 rounded-md border-0 bg-transparent px-2 text-muted-foreground shadow-none",
              "hover:bg-foreground/10 hover:text-foreground",
              className,
            )}
            title={t("buttonTitle")}
            aria-label={t("buttonAria")}
          >
            <FileText className="size-3.5 shrink-0" />
            <span className="truncate text-xs font-medium">{displayTitle}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b px-3 py-2">
            <div className="text-sm font-medium">{t("popoverTitle")}</div>
            <div className="text-xs text-muted-foreground">{t("popoverHint")}</div>
            {canvasDir ? (
              <button
                type="button"
                className="mt-1 flex max-w-full items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => void copyPath("")}
                title={canvasDir}
              >
                <Copy className="size-3 shrink-0" />
                <span className="truncate">{canvasDir}</span>
              </button>
            ) : null}
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {documentList.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t("empty")}
              </div>
            ) : (
              documentList.map((item) => {
                const active = item.file_name === fileName;
                return (
                  <div
                    key={item.file_name}
                    className={cn(
                      "group flex items-start gap-1 rounded-md",
                      active && "bg-muted",
                    )}
                  >
                    <button
                      type="button"
                      disabled={working || isBusy}
                      onClick={() => requestOpen(item.file_name)}
                      className={cn(
                        "flex min-w-0 flex-1 flex-col rounded-md px-3 py-2 text-left text-sm transition-colors",
                        "hover:bg-muted",
                      )}
                    >
                      <span className="font-medium">{item.title}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {item.file_name}
                      </span>
                    </button>
                    <div className="relative shrink-0 pr-1 pt-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        disabled={working || isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuFor((cur) =>
                            cur === item.file_name ? null : item.file_name,
                          );
                        }}
                        aria-label={t("rowMenuAria")}
                      >
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                      {menuFor === item.file_name ? (
                        <div className="absolute right-0 top-8 z-10 min-w-[140px] rounded-md border bg-popover p-1 shadow-md">
                          <button
                            type="button"
                            className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                            onClick={() => {
                              setRenameTarget(item.file_name);
                              setRenameName(item.title);
                              setMenuFor(null);
                            }}
                          >
                            {t("rename")}
                          </button>
                          <button
                            type="button"
                            className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                            onClick={() => {
                              setWorking(true);
                              void onDuplicate(item.file_name)
                                .then(() => onRefreshList())
                                .finally(() => setWorking(false));
                              setMenuFor(null);
                            }}
                          >
                            {t("duplicate")}
                          </button>
                          <button
                            type="button"
                            className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                            onClick={() => void copyPath(item.file_name)}
                          >
                            {t("copyPath")}
                          </button>
                          <button
                            type="button"
                            className="block w-full rounded px-2 py-1.5 text-left text-xs text-destructive hover:bg-muted"
                            onClick={() => {
                              setDeleteTarget(item.file_name);
                              setMenuFor(null);
                            }}
                          >
                            {t("delete")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex flex-wrap gap-1 border-t p-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              disabled={working || isBusy}
              onClick={() => requestNew()}
            >
              {t("new")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              disabled={working || isBusy || (!dirty && !!fileName)}
              onClick={() => {
                if (!fileName) {
                  setSaveAsName(title === "Untitled" ? "" : title);
                  setSaveAsAfter("none");
                  setSaveAsOpen(true);
                  return;
                }
                void onSave();
              }}
            >
              {t("save")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              disabled={working || isBusy}
              onClick={() => {
                setSaveAsName(title === "Untitled" ? "" : title);
                setSaveAsAfter("none");
                setSaveAsOpen(true);
              }}
            >
              {t("saveAs")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {pending ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-lg">
            <div className="text-sm font-medium">{t("dirtyTitle")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("dirtyBody")}</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" disabled={working} onClick={() => setPending(null)}>
                {t("dirtyCancel")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={working}
                onClick={() => void handleDirtyDiscard()}
              >
                {t("dirtyDiscard")}
              </Button>
              <Button size="sm" disabled={working} onClick={() => void handleDirtySave()}>
                {working ? <Loader2 className="size-3.5 animate-spin" /> : t("dirtySave")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {saveAsOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-lg">
            <div className="text-sm font-medium">{t("saveAsTitle")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("saveAsHint")}</p>
            <Input
              className="mt-3"
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              placeholder={t("saveAsPlaceholder")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void confirmSaveAs();
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={working}
                onClick={() => {
                  setSaveAsOpen(false);
                  setSaveAsAfter("none");
                  setPendingOpenFile(null);
                }}
              >
                {t("dirtyCancel")}
              </Button>
              <Button
                size="sm"
                disabled={working || !saveAsName.trim()}
                onClick={() => void confirmSaveAs()}
              >
                {working ? <Loader2 className="size-3.5 animate-spin" /> : t("saveAsConfirm")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {renameTarget ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-lg">
            <div className="text-sm font-medium">{t("renameTitle")}</div>
            <Input
              className="mt-3"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setRenameTarget(null)}>
                {t("dirtyCancel")}
              </Button>
              <Button
                size="sm"
                disabled={working || !renameName.trim()}
                onClick={() => {
                  setWorking(true);
                  void onRename(renameTarget, renameName.trim())
                    .then(() => {
                      setRenameTarget(null);
                      return onRefreshList();
                    })
                    .finally(() => setWorking(false));
                }}
              >
                {working ? <Loader2 className="size-3.5 animate-spin" /> : t("renameConfirm")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-lg">
            <div className="text-sm font-medium">{t("deleteTitle")}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("deleteBody", { name: deleteTarget })}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(null)}>
                {t("dirtyCancel")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={working}
                onClick={() => {
                  setWorking(true);
                  void onDelete(deleteTarget)
                    .then(() => {
                      setDeleteTarget(null);
                      return onRefreshList();
                    })
                    .finally(() => setWorking(false));
                }}
              >
                {working ? <Loader2 className="size-3.5 animate-spin" /> : t("deleteConfirm")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
