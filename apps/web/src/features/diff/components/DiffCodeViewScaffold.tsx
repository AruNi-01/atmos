"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ScrollArea, Skeleton } from "@workspace/ui";
import { AnimatePresence, motion } from "motion/react";
import { DiffFileTree, type DiffFileTreeItem } from "@/features/diff/components/DiffFileTree";

interface DiffCodeViewScaffoldProps {
  items: DiffFileTreeItem[];
  selectedPath?: string;
  ariaLabel: string;
  toolbar: ReactNode;
  renderFileInlineDecoration?: (item: DiffFileTreeItem) => ReactNode;
  onSelectFile: (path: string) => void;
  children: ReactNode;
  loading?: boolean;
  loadingTreeLabel?: string;
  defaultTreeVisible?: boolean;
}

export function DiffCodeViewScaffold({
  items,
  selectedPath,
  ariaLabel,
  toolbar,
  renderFileInlineDecoration,
  onSelectFile,
  children,
  loading = false,
  loadingTreeLabel,
  defaultTreeVisible = true,
}: DiffCodeViewScaffoldProps) {
  const [treeVisible, setTreeVisible] = useState(defaultTreeVisible);
  const [treeWidth, setTreeWidth] = useState(224);
  const [isResizing, setIsResizing] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border/40 px-2 py-1.5 shrink-0">
        <button
          type="button"
          aria-label={treeVisible ? "Hide file tree" : "Show file tree"}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          onClick={() => setTreeVisible((value) => !value)}
          title={treeVisible ? "Hide file tree" : "Show file tree"}
        >
          {treeVisible ? (
            <PanelLeftClose className="size-3.5" />
          ) : (
            <PanelLeftOpen className="size-3.5" />
          )}
        </button>
        <div className="flex-1 min-w-0">{toolbar}</div>
      </div>

      <div className="flex flex-1 min-h-0">
        <AnimatePresence initial={false}>
          {treeVisible ? (
            <motion.div
              key="tree"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: treeWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={
                isResizing
                  ? { duration: 0 }
                  : { duration: 0.2, ease: "easeInOut" }
              }
              className="shrink-0 overflow-hidden"
            >
              {loading ? (
                <div
                  className="flex h-full flex-col gap-1.5 overflow-hidden border-r border-border/40 p-2"
                  style={{ width: treeWidth }}
                >
                  {loadingTreeLabel ? (
                    <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                      {loadingTreeLabel}
                    </div>
                  ) : null}
                  {[...Array(16)].map((_, index) => (
                    <Skeleton
                      key={index}
                      className="h-4 rounded shrink-0"
                      style={{
                        width: `${40 + (index % 5) * 10}%`,
                        marginLeft: index % 3 !== 0 ? "12px" : "0",
                      }}
                    />
                  ))}
                </div>
              ) : (
                <ScrollArea
                  className="h-full border-r border-border/40 py-1"
                  style={{ width: treeWidth }}
                >
                  <DiffFileTree
                    items={items}
                    selectedPath={selectedPath}
                    ariaLabel={ariaLabel}
                    renderFileInlineDecoration={renderFileInlineDecoration}
                    onSelectFile={onSelectFile}
                  />
                </ScrollArea>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {treeVisible ? (
          <div
            className="relative w-px shrink-0 cursor-col-resize bg-border/40 transition-colors before:absolute before:-inset-x-2 before:h-full before:transition-colors before:hover:bg-primary/40"
            onMouseDown={(event) => {
              event.preventDefault();
              setIsResizing(true);
              const startX = event.clientX;
              const startWidth = treeWidth;
              const onMove = (moveEvent: MouseEvent) => {
                setTreeWidth(
                  Math.max(140, Math.min(480, startWidth + moveEvent.clientX - startX)),
                );
              };
              const onUp = () => {
                setIsResizing(false);
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
          />
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {loading ? (
            <div className="flex flex-1 flex-col gap-3 p-2">
              {[...Array(4)].map((_, index) => (
                <Skeleton key={index} className="h-28 rounded-lg" />
              ))}
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
