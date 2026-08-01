"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Binary, ChevronRight } from "lucide-react";
import { getFileIconProps } from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { useOverflowAwareDecorationVisibility } from "@/shared/hooks/use-overflow-aware-decoration-visibility";
import { setAgentContextDragData } from "@/shared/lib/agent-context-drag";

export interface DiffFileTreeItem {
  path: string;
  gitStatus?: string | null;
  annotation?: React.ReactNode;
  additions?: number;
  deletions?: number;
  /** When true, show a binary icon instead of +/- line counts. */
  isBinary?: boolean;
}

interface DiffFileTreeProps {
  items: DiffFileTreeItem[];
  selectedPath?: string;
  ariaLabel: string;
  className?: string;
  indentOffset?: number;
  style?: React.CSSProperties;
  isFileActionActive?: (path: string) => boolean;
  /** Keep directory action chrome mounted while confirm/run is in progress. */
  isDirectoryActionActive?: (items: DiffFileTreeItem[]) => boolean;
  renderFileActions?: (item: DiffFileTreeItem) => React.ReactNode;
  renderDirectoryActions?: (items: DiffFileTreeItem[]) => React.ReactNode;
  renderDirectoryDecoration?: (items: DiffFileTreeItem[]) => React.ReactNode;
  renderFileInlineDecoration?: (item: DiffFileTreeItem) => React.ReactNode;
  renderFileDecoration?: (item: DiffFileTreeItem) => React.ReactNode;
  onSelectFile: (path: string) => void;
  onDoubleClickFile?: (path: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  file?: DiffFileTreeItem;
}

interface TreeRow {
  id: string;
  name: string;
  path: string;
  depth: number;
  type: "directory" | "file";
  file?: DiffFileTreeItem;
  files: DiffFileTreeItem[];
  hasChangedDescendant?: boolean;
}

function createNode(name: string, path: string): TreeNode {
  return {
    name,
    path,
    children: new Map(),
  };
}

function basename(path: string) {
  return path.split("/").pop() || path;
}

function buildTree(items: DiffFileTreeItem[]) {
  const root = createNode("", "");

  for (const item of items) {
    const parts = item.path.split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) continue;

    let current = root;
    let currentPath = "";
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let child = current.children.get(part);
      if (!child) {
        child = createNode(part, currentPath);
        current.children.set(part, child);
      }
      current = child;
    }

    current.children.set(fileName, {
      name: fileName,
      path: item.path,
      children: new Map(),
      file: item,
    });
  }

  return root;
}

function flattenDirectory(node: TreeNode) {
  let current = node;
  const names = [current.name];

  while (!current.file && current.children.size === 1) {
    const next = Array.from(current.children.values())[0];
    if (!next || next.file) break;
    names.push(next.name);
    current = next;
  }

  return {
    node: current,
    name: names.join(" / "),
  };
}

function hasChangedDescendant(node: TreeNode): boolean {
  if (node.file?.gitStatus) return true;
  for (const child of node.children.values()) {
    if (hasChangedDescendant(child)) return true;
  }
  return false;
}

function collectFiles(node: TreeNode): DiffFileTreeItem[] {
  if (node.file) return [node.file];
  return Array.from(node.children.values()).flatMap(collectFiles);
}

function buildRows(
  node: TreeNode,
  openDirectories: ReadonlySet<string>,
  depth = 0,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const children = Array.from(node.children.values());

  for (const child of children) {
    if (child.file) {
      rows.push({
        id: child.path,
        name: child.name,
        path: child.path,
        depth,
        type: "file",
        file: child.file,
        files: [child.file],
      });
      continue;
    }

    const flattened = flattenDirectory(child);
    rows.push({
      id: flattened.node.path,
      name: flattened.name,
      path: flattened.node.path,
      depth,
      type: "directory",
      files: collectFiles(flattened.node),
      hasChangedDescendant: hasChangedDescendant(flattened.node),
    });

    if (openDirectories.has(flattened.node.path)) {
      rows.push(...buildRows(flattened.node, openDirectories, depth + 1));
    }
  }

  return rows;
}

function getInitialOpenDirectories(node: TreeNode) {
  const open = new Set<string>();

  function visit(current: TreeNode) {
    for (const child of current.children.values()) {
      if (child.file) continue;
      const flattened = flattenDirectory(child);
      open.add(flattened.node.path);
      visit(flattened.node);
    }
  }

  visit(node);
  return open;
}

function statusClassName(status: string | null | undefined) {
  switch (status) {
    case "A":
    case "?":
      return "text-emerald-500";
    case "D":
      return "text-red-500";
    case "R":
      return "text-sky-400";
    case "M":
    default:
      return "text-yellow-500";
  }
}

function changeCountDecoration(
  additions = 0,
  deletions = 0,
  options?: {
    className?: string;
    ref?: React.Ref<HTMLDivElement>;
  },
) {
  if (additions <= 0 && deletions <= 0) return null;

  return (
    <div
      ref={options?.ref}
      className={cn("flex items-center gap-1 font-medium", options?.className)}
    >
      {additions > 0 ? (
        <span className="text-emerald-500">+{additions}</span>
      ) : null}
      {deletions > 0 ? (
        <span className="text-red-500">-{deletions}</span>
      ) : null}
    </div>
  );
}

function defaultDecoration(
  item: DiffFileTreeItem,
  options?: {
    hideChangeCounts?: boolean;
    changeCountsRef?: React.Ref<HTMLDivElement>;
  },
) {
  const status = item.gitStatus === "?" ? "U" : item.gitStatus;
  const changeCounts = item.isBinary
    ? (
        <div
          ref={options?.changeCountsRef}
          className={cn(
            "flex items-center text-muted-foreground",
            options?.hideChangeCounts && "hidden",
          )}
          title="Binary"
          aria-label="Binary"
        >
          <Binary className="size-3.5 shrink-0" strokeWidth={2} />
        </div>
      )
    : item.gitStatus !== "?"
      ? changeCountDecoration(item.additions, item.deletions, {
          ref: options?.changeCountsRef,
          className: options?.hideChangeCounts ? "hidden" : undefined,
        })
      : null;
  if (!item.annotation && !changeCounts && !status) return null;

  return (
    <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums">
      {item.annotation ? (
        <span className="text-muted-foreground">{item.annotation}</span>
      ) : null}
      {changeCounts}
      {status ? (
        <span className={cn("w-3 text-center font-bold", statusClassName(item.gitStatus))}>
          {status}
        </span>
      ) : null}
    </div>
  );
}

function defaultDirectoryDecoration(
  items: DiffFileTreeItem[],
  options?: {
    hideChangeCounts?: boolean;
    changeCountsRef?: React.Ref<HTMLDivElement>;
  },
) {
  const additions = items.reduce((sum, item) => sum + (item.additions ?? 0), 0);
  const deletions = items.reduce((sum, item) => sum + (item.deletions ?? 0), 0);
  const changeCounts = changeCountDecoration(additions, deletions, {
    ref: options?.changeCountsRef,
    className: options?.hideChangeCounts ? "hidden" : undefined,
  });

  if (!changeCounts) {
    return <span className="size-2 rounded-full bg-yellow-500/70" />;
  }

  return (
    <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums">
      {changeCounts}
      <span className="size-2 rounded-full bg-yellow-500/70" />
    </div>
  );
}

function FileIcon({ name }: { name: string }) {
  const iconProps = getFileIconProps({ name, isDir: false, className: "size-4 shrink-0" });
  return <img {...iconProps} alt="" />;
}

function useShouldHideTreeChangeCounts(measurementKey: string) {
  const {
    textRef: nameRef,
    decorationRef: countsRef,
    shouldHideDecoration: shouldHideCounts,
  } = useOverflowAwareDecorationVisibility({ measurementKey });
  return { nameRef, countsRef, shouldHideCounts };
}

interface DiffFileTreeRowProps {
  row: TreeRow;
  indentOffset: number;
  isSelected: boolean;
  isHovered: boolean;
  isActionActive: boolean;
  isDirectoryActionActive: boolean;
  actions: React.ReactNode;
  directoryActions: React.ReactNode;
  decoration: React.ReactNode;
  directoryDecoration: React.ReactNode;
  inlineDecoration: React.ReactNode;
  openDirectories: ReadonlySet<string>;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  onDoubleClickFile?: (path: string) => void;
  onHover: (path: string) => void;
}

function DiffFileTreeRow({
  row,
  indentOffset,
  isSelected,
  isHovered,
  isActionActive,
  isDirectoryActionActive,
  actions,
  directoryActions,
  decoration,
  directoryDecoration,
  inlineDecoration,
  openDirectories,
  onToggleDirectory,
  onSelectFile,
  onDoubleClickFile,
  onHover,
}: DiffFileTreeRowProps) {
  const showDirectoryActions =
    !!directoryActions && (isHovered || isDirectoryActionActive);
  const file = row.type === "file" ? row.file : undefined;
  const { nameRef, countsRef, shouldHideCounts } =
    useShouldHideTreeChangeCounts(row.id);
  const defaultFileDecoration =
    file && !decoration
      ? defaultDecoration(file, {
          hideChangeCounts: shouldHideCounts,
          changeCountsRef: countsRef,
        })
      : null;
  const defaultDirectoryDecorationNode =
    !file && !directoryDecoration && row.hasChangedDescendant
      ? defaultDirectoryDecoration(row.files, {
          hideChangeCounts: shouldHideCounts,
          changeCountsRef: countsRef,
        })
      : null;
  return (
    <div
      role="treeitem"
      data-diff-file-path={file?.path}
      aria-selected={isSelected || undefined}
      aria-expanded={
        row.type === "directory" ? openDirectories.has(row.path) : undefined
      }
      className={cn(
        "group/file relative flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-[13px] outline-none transition-colors",
        file ? "cursor-pointer" : "cursor-default",
        isSelected
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "hover:bg-sidebar-accent/50",
      )}
      draggable
      style={{ paddingLeft: indentOffset + 8 + row.depth * 14 }}
      onDragStart={(event) => {
        setAgentContextDragData(event.dataTransfer, {
          kind: file ? "file" : "directory",
          path: row.path,
        });
      }}
      onClick={() => {
        if (file) {
          onSelectFile(row.path);
        } else {
          onToggleDirectory(row.path);
        }
      }}
      onDoubleClick={() => {
        if (file) {
          onDoubleClickFile?.(row.path);
        }
      }}
      onMouseEnter={() => onHover(row.id)}
    >
      {row.type === "directory" ? (
        <>
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              openDirectories.has(row.path) && "rotate-90",
            )}
          />
          <span ref={nameRef} className="min-w-0 flex-1 truncate text-foreground">
            {row.name}
          </span>
          {directoryDecoration || defaultDirectoryDecorationNode ? (
            <div
              className={cn(
                "ml-auto flex shrink-0 items-center justify-end transition-opacity",
                directoryActions &&
                  (showDirectoryActions ? "invisible" : undefined),
              )}
            >
              {directoryDecoration ?? defaultDirectoryDecorationNode}
            </div>
          ) : null}
          {showDirectoryActions ? (
            <div
              className={cn(
                "absolute right-2 z-10 flex items-center gap-1 rounded-md bg-sidebar-accent/95",
                isDirectoryActionActive
                  ? "opacity-100 pointer-events-auto"
                  : undefined,
              )}
            >
              {directoryActions}
            </div>
          ) : null}
        </>
      ) : row.file ? (
        <>
          <span className="w-4 shrink-0" />
          <FileIcon name={basename(row.path)} />
          <span ref={nameRef} className="min-w-0 flex-1 truncate text-foreground">
            {row.name}
          </span>
          {inlineDecoration ? (
            <span className="shrink-0">{inlineDecoration}</span>
          ) : null}
          {decoration || defaultFileDecoration ? (
            <div
              className={cn(
                "flex shrink-0 items-center justify-end transition-opacity",
                actions &&
                  (isActionActive
                    ? "invisible"
                    : "group-hover/file:invisible"),
              )}
            >
              {decoration ?? defaultFileDecoration}
            </div>
          ) : null}
          {actions ? (
            <div
              className={cn(
                "absolute right-2 z-10 flex items-center gap-1 rounded-md bg-sidebar-accent/95 transition-opacity",
                isActionActive
                  ? "opacity-100 pointer-events-auto"
                  : "opacity-0 pointer-events-none group-hover/file:pointer-events-auto group-hover/file:opacity-100",
              )}
            >
              {actions}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function DiffFileTree({
  items,
  selectedPath,
  ariaLabel,
  className,
  indentOffset = 0,
  style,
  isFileActionActive,
  isDirectoryActionActive,
  renderFileActions,
  renderDirectoryActions,
  renderDirectoryDecoration,
  renderFileInlineDecoration,
  renderFileDecoration,
  onSelectFile,
  onDoubleClickFile,
}: DiffFileTreeProps) {
  const root = useMemo(() => buildTree(items), [items]);
  const [openDirectories, setOpenDirectories] = useState(() =>
    getInitialOpenDirectories(root),
  );
  const [hoveredRowPath, setHoveredRowPath] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(
    () => buildRows(root, openDirectories),
    [openDirectories, root],
  );

  useEffect(() => {
    if (!selectedPath) return;
    const selectedRow = Array.from(
      treeRef.current?.querySelectorAll<HTMLElement>("[data-diff-file-path]") ?? [],
    ).find((row) => row.dataset.diffFilePath === selectedPath);
    selectedRow?.scrollIntoView({ block: "nearest" });
  }, [rows, selectedPath]);

  const toggleDirectory = (path: string) => {
    setOpenDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div
      ref={treeRef}
      role="tree"
      aria-label={ariaLabel}
      className={cn("w-full overflow-y-auto pr-1", className)}
      style={style}
      onMouseLeave={() => setHoveredRowPath(null)}
    >
      <AnimatePresence>
      {rows.map((row) => {
        const file = row.type === "file" ? row.file : undefined;
        const isSelected = !!file && selectedPath === row.path;
        const isActionActive =
          file && isFileActionActive ? isFileActionActive(row.path) : false;
        const directoryActionActive =
          !file && isDirectoryActionActive
            ? isDirectoryActionActive(row.files)
            : false;
        const directoryActions =
          !file && renderDirectoryActions ? renderDirectoryActions(row.files) : null;
        const actions = file && renderFileActions ? renderFileActions(file) : null;
        const decoration =
          file
            ? (renderFileDecoration?.(file) ?? null)
            : null;
        const inlineDecoration =
          file && renderFileInlineDecoration ? renderFileInlineDecoration(file) : null;
        const directoryDecoration =
          !file && renderDirectoryDecoration
            ? renderDirectoryDecoration(row.files)
            : null;

        return (
          <motion.div
            key={`${row.type}:${row.id}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <DiffFileTreeRow
              row={row}
              indentOffset={indentOffset}
              isSelected={isSelected}
              isHovered={hoveredRowPath === row.id}
              isActionActive={isActionActive}
              isDirectoryActionActive={directoryActionActive}
              actions={actions}
              directoryActions={directoryActions}
              decoration={decoration}
              directoryDecoration={directoryDecoration}
              inlineDecoration={inlineDecoration}
              openDirectories={openDirectories}
              onToggleDirectory={toggleDirectory}
              onSelectFile={onSelectFile}
              onDoubleClickFile={onDoubleClickFile}
              onHover={setHoveredRowPath}
            />
          </motion.div>
        );
      })}
      </AnimatePresence>
    </div>
  );
}
