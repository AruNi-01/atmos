"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
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

function formatSavedAt(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function CanvasDocumentsControl({
  title,
  fileName,
  dirty,
  documentList,
  isBusy,
  onRefreshList,
  onOpen,
  onNew,
  onFlushSave,
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
  /** Persist current editor before switching / creating when dirty. */
  onFlushSave?: () => void | Promise<void>;
  onRename: (fileName: string, name: string) => void | Promise<void>;
  onDelete: (fileName: string) => void | Promise<void>;
  onDuplicate: (fileName: string) => void | Promise<void>;
  className?: string;
}) {
  const t = useTranslations("Canvas.documents");
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState<string | null>(null);
  const [renameName, setRenameName] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    void Promise.resolve(onRefreshList()).catch((err) => {
      toastManager.add({
        title: t("popoverTitle"),
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    });
  }, [open, onRefreshList, t]);

  const reportError = (title: string, err: unknown) => {
    toastManager.add({
      title,
      description: err instanceof Error ? err.message : String(err),
      type: "error",
    });
  };

  const displayTitle = dirty ? `${title} •` : title;

  const flushIfNeeded = async () => {
    if (dirty && onFlushSave) {
      await onFlushSave();
    }
  };

  const runOpen = async (nextFile: string) => {
    setWorking(true);
    try {
      await flushIfNeeded();
      await onOpen(nextFile);
      setOpen(false);
    } catch (err) {
      toastManager.add({
        title: t("popoverTitle"),
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setWorking(false);
    }
  };

  const runNew = async () => {
    setWorking(true);
    try {
      await flushIfNeeded();
      await onNew();
      setOpen(false);
    } catch (err) {
      toastManager.add({
        title: t("popoverTitle"),
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setWorking(false);
    }
  };

  const requestOpen = (nextFile: string) => {
    if (nextFile === fileName) {
      setOpen(false);
      return;
    }
    void runOpen(nextFile);
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
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <div className="text-sm font-medium">{t("popoverTitle")}</div>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 shrink-0 text-xs"
              disabled={working || isBusy}
              onClick={() => void runNew()}
            >
              {working ? <Loader2 className="size-3.5 animate-spin" /> : t("new")}
            </Button>
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
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
                      // One fused row: hover/active paint the full item including ···
                      "group flex items-center gap-0.5 rounded-lg px-1.5 py-1 transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted/70",
                    )}
                  >
                    <button
                      type="button"
                      disabled={working || isBusy}
                      onClick={() => requestOpen(item.file_name)}
                      className={cn(
                        "flex min-w-0 flex-1 flex-col rounded-md px-2 py-1.5 text-left text-sm",
                        "outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      )}
                    >
                      <span className="truncate font-medium">
                        {item.title}
                        {active && dirty ? " •" : ""}
                      </span>
                      <span
                        className={cn(
                          "text-[11px]",
                          active ? "text-accent-foreground/70" : "text-muted-foreground",
                        )}
                      >
                        {formatSavedAt(item.modified_at, locale)}
                      </span>
                    </button>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className={cn(
                            "size-7 shrink-0 rounded-md text-muted-foreground",
                            // Blend into the row; no separate “chip” background
                            "bg-transparent shadow-none",
                            "hover:bg-foreground/10 hover:text-foreground",
                            "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                            "data-[state=open]:opacity-100 data-[state=open]:bg-foreground/10",
                            active && "opacity-70 group-hover:opacity-100",
                          )}
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
                              .catch((err) => reportError(t("duplicate"), err))
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
        </PopoverContent>
      </Popover>

      <Dialog open={renameTarget != null} onOpenChange={(v) => !v && setRenameTarget(null)}>
        <DialogContent className="z-[400] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("renameTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            autoFocus
            disabled={working}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !working &&
                renameTarget &&
                renameName.trim()
              ) {
                e.preventDefault();
                setWorking(true);
                void onRename(renameTarget, renameName.trim())
                  .then(() => {
                    setRenameTarget(null);
                    return onRefreshList();
                  })
                  .catch((err) => {
                    toastManager.add({
                      title: t("renameTitle"),
                      description:
                        err instanceof Error && err.message.includes("already exists")
                          ? t("nameConflict")
                          : err instanceof Error
                            ? err.message
                            : t("nameConflict"),
                      type: "error",
                    });
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
                if (!renameTarget || working) return;
                setWorking(true);
                void onRename(renameTarget, renameName.trim())
                  .then(() => {
                    setRenameTarget(null);
                    return onRefreshList();
                  })
                  .catch((err) => {
                    toastManager.add({
                      title: t("renameTitle"),
                      description:
                        err instanceof Error && err.message.includes("already exists")
                          ? t("nameConflict")
                          : err instanceof Error
                            ? err.message
                            : t("nameConflict"),
                      type: "error",
                    });
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
                  .catch((err) => reportError(t("deleteTitle"), err))
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
