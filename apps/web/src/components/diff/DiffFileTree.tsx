"use client";

import React, { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { getFileIconProps } from "@workspace/ui";
import { cn } from "@/lib/utils";

export interface DiffFileTreeItem {
  path: string;
  gitStatus?: string | null;
  annotation?: React.ReactNode;
  additions?: number;
  deletions?: number;
}

interface DiffFileTreeProps {
  items: DiffFileTreeItem[];
  selectedPath?: string;
  ariaLabel: string;
  className?: string;
  indentOffset?: number;
  style?: React.CSSProperties;
  isFileActionActive?: (path: string) => boolean;
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
  const children = Array.from(node.children.values()).sort((a, b) => {
    if (!!a.file !== !!b.file) return a.file ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

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

function changeCountDecoration(additions = 0, deletions = 0) {
  if (additions <= 0 && deletions <= 0) return null;

  return (
    <div className="flex items-center gap-1 font-medium">
      {additions > 0 ? (
        <span className="text-emerald-500">+{additions}</span>
      ) : null}
      {deletions > 0 ? (
        <span className="text-red-500">-{deletions}</span>
      ) : null}
    </div>
  );
}

function defaultDecoration(item: DiffFileTreeItem) {
  const status = item.gitStatus === "?" ? "U" : item.gitStatus;
  const changeCounts =
    item.gitStatus !== "?"
      ? changeCountDecoration(item.additions, item.deletions)
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

function defaultDirectoryDecoration(items: DiffFileTreeItem[]) {
  const additions = items.reduce((sum, item) => sum + (item.additions ?? 0), 0);
  const deletions = items.reduce((sum, item) => sum + (item.deletions ?? 0), 0);
  const changeCounts = changeCountDecoration(additions, deletions);

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
  const rows = useMemo(
    () => buildRows(root, openDirectories),
    [openDirectories, root],
  );

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
      role="tree"
      aria-label={ariaLabel}
      className={cn("w-full overflow-y-auto pr-1", className)}
      style={style}
    >
      {rows.map((row) => {
        const file = row.type === "file" ? row.file : undefined;
        const isSelected = !!file && selectedPath === row.path;
        const isActionActive =
          file && isFileActionActive ? isFileActionActive(row.path) : false;
        const directoryActions =
          !file && renderDirectoryActions ? renderDirectoryActions(row.files) : null;
        const isDirectoryActionsVisible =
          !file && isDirectoryActionActive
            ? isDirectoryActionActive(row.files)
            : false;
        const actions = file && renderFileActions ? renderFileActions(file) : null;
        const decoration =
          file
            ? (renderFileDecoration?.(file) ?? defaultDecoration(file))
            : null;
        const inlineDecoration =
          file && renderFileInlineDecoration ? renderFileInlineDecoration(file) : null;
        const directoryDecoration =
          !file && renderDirectoryDecoration
            ? renderDirectoryDecoration(row.files)
            : row.hasChangedDescendant
              ? defaultDirectoryDecoration(row.files)
              : null;

        return (
          <div
            key={`${row.type}:${row.id}`}
            role="treeitem"
            aria-selected={isSelected || undefined}
            aria-expanded={
              row.type === "directory" ? openDirectories.has(row.path) : undefined
            }
            className={cn(
              "group/file relative flex h-7 min-w-0 items-center gap-1 rounded-md px-2 pr-24 text-[13px] outline-none transition-colors",
              file ? "cursor-pointer" : "cursor-default",
              isSelected
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "hover:bg-sidebar-accent/50",
            )}
            style={{ paddingLeft: indentOffset + 8 + row.depth * 14 }}
            onClick={() => {
              if (file) {
                onSelectFile(row.path);
              } else {
                toggleDirectory(row.path);
              }
            }}
            onDoubleClick={() => {
              if (file) {
                onDoubleClickFile?.(row.path);
              }
            }}
          >
            {row.type === "directory" ? (
              <>
                <ChevronRight
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    openDirectories.has(row.path) && "rotate-90",
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {row.name}
                </span>
                {directoryDecoration ? (
                  <div
                    className={cn(
                      "absolute right-4 flex min-w-8 items-center justify-end transition-opacity",
                      directoryActions &&
                        (isDirectoryActionsVisible
                          ? "invisible"
                          : "group-hover/file:invisible"),
                    )}
                  >
                    {directoryDecoration}
                  </div>
                ) : null}
                {directoryActions ? (
                  <div
                    className={cn(
                      "absolute right-2 z-10 flex items-center gap-1 rounded-md bg-sidebar-accent/95 transition-opacity",
                      isDirectoryActionsVisible
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none group-hover/file:pointer-events-auto group-hover/file:opacity-100",
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
                <span className="min-w-0 truncate text-foreground">
                  {row.name}
                </span>
                {inlineDecoration ? (
                  <span className="shrink-0">{inlineDecoration}</span>
                ) : null}
                <span className="min-w-0 flex-1" />
                {decoration ? (
                  <div
                    className={cn(
                      "absolute right-4 flex min-w-8 items-center justify-end transition-opacity",
                      actions &&
                        (isActionActive
                          ? "invisible"
                          : "group-hover/file:invisible"),
                    )}
                  >
                    {decoration}
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
      })}
    </div>
  );
}
