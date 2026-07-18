"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { FileText, Loader2, MoreHorizontal } from "lucide-react";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
  toastManager,
} from "@workspace/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/ui/dropdown-menu";
import type { CanvasDocumentListItem } from "@/api/rest-api";

type DirtyAction = "switch" | "new";

export function CanvasDocumentsControl({
  title,
  fileName,
  dirty,
  documentList,
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

  const openSaveAsDialog = (after: "none" | DirtyAction | "open" = "none", openFile?: string) => {
    setSaveAsName(title === "Untitled" ? "" : title);
    setSaveAsAfter(after);
    setPendingOpenFile(openFile ?? null);
    setSaveAsOpen(true);
  };

  const handleDirtySave = async () => {
    if (!pending) return;
    setWorking(true);
    try {
      if (!fileName) {
        openSaveAsDialog(
          pending.action === "switch" ? "open" : pending.action,
          pending.fileName,
        );
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
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("nameConflict");
      toastManager.add({
        title: t("saveAsTitle"),
        description: message.includes("already exists")
          ? t("nameConflict")
          : message,
        type: "error",
      });
    } finally {
      setWorking(false);
    }
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
        <PopoverContent
          align="end"
          sideOffset={8}
          className="z-[200] w-80 overflow-visible p-0"
        >
          <div className="border-b px-3 py-2">
            <div className="text-sm font-medium">{t("popoverTitle")}</div>
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
                      "group flex items-center gap-1 rounded-md",
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
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="mr-1 size-7 shrink-0"
                          disabled={working || isBusy}
                          aria-label={t("rowMenuAria")}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        side="bottom"
                        sideOffset={4}
                        className="z-[300] min-w-[148px]"
                      >
                        <DropdownMenuItem
                          onSelect={() => {
                            setRenameTarget(item.file_name);
                            setRenameName(item.title);
                          }}
                        >
                          {t("rename")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setWorking(true);
                            void onDuplicate(item.file_name)
                              .then(() => onRefreshList())
                              .finally(() => setWorking(false));
                          }}
                        >
                          {t("duplicate")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeleteTarget(item.file_name)}
                        >
                          {t("delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                  openSaveAsDialog("none");
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
              onClick={() => openSaveAsDialog("none")}
            >
              {t("saveAs")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Dirty guard — portal dialog so tldraw transforms do not trap layout */}
      <Dialog open={pending != null} onOpenChange={(v) => !v && setPending(null)}>
        <DialogContent className="z-[400] sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("dirtyTitle")}</DialogTitle>
            <DialogDescription>{t("dirtyBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={saveAsOpen}
        onOpenChange={(v) => {
          if (!v) {
            setSaveAsOpen(false);
            setSaveAsAfter("none");
            setPendingOpenFile(null);
          }
        }}
      >
        <DialogContent className="z-[400] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("saveAsTitle")}</DialogTitle>
            <DialogDescription>{t("saveAsHint")}</DialogDescription>
          </DialogHeader>
          <Input
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
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameTarget != null} onOpenChange={(v) => !v && setRenameTarget(null)}>
        <DialogContent className="z-[400] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("renameTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameTarget && renameName.trim()) {
                e.preventDefault();
                setWorking(true);
                void onRename(renameTarget, renameName.trim())
                  .then(() => {
                    setRenameTarget(null);
                    return onRefreshList();
                  })
                  .finally(() => setWorking(false));
              }
            }}
          />
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setRenameTarget(null)}>
              {t("dirtyCancel")}
            </Button>
            <Button
              size="sm"
              disabled={working || !renameName.trim() || !renameTarget}
              onClick={() => {
                if (!renameTarget) return;
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget != null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="z-[400] sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteBody", { name: deleteTarget ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t("dirtyCancel")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={working || !deleteTarget}
              onClick={() => {
                if (!deleteTarget) return;
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
