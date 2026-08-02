"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UnresolvedFile, type FileContents } from "@pierre/diffs";
import { getFileIconProps, Loader2, toastManager } from "@workspace/ui";
import { useTheme } from "next-themes";
import { fsApi } from "@/api/ws-api";
import { useGitStore } from "@/features/git/store/use-git-store";
import {
  useGitChangedFilesQuery,
  invalidateGitQueries,
} from "@/features/git/hooks/use-git-changed-files-query";
import { parseConflictResolvePrRef } from "@/features/editor/store/use-editor-store";
import { usePrConflictPreviewStore } from "@/features/github/store/use-pr-conflict-preview-store";

const CONFLICT_STATUSES = new Set([
  "DD",
  "AU",
  "UD",
  "UA",
  "DU",
  "AA",
  "UU",
  "U",
]);

function toAbsolutePath(repoPath: string, relativePath: string): string {
  if (relativePath.startsWith("/")) {
    return relativePath;
  }
  const normalizedRepo = repoPath.endsWith("/") ? repoPath.slice(0, -1) : repoPath;
  return `${normalizedRepo}/${relativePath}`;
}

interface ConflictFileRendererProps {
  file: FileContents;
  theme: "pierre-dark" | "pierre-light";
  readOnly?: boolean;
  onResolved: (nextFile: FileContents) => void;
}

function ConflictFileRenderer({
  file,
  theme,
  readOnly = false,
  onResolved,
}: ConflictFileRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileName = useMemo(
    () => file.name.split("/").pop() || file.name,
    [file.name],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const headerPrefix = () => {
      const wrapper = document.createElement("span");
      wrapper.style.display = "inline-flex";
      wrapper.style.alignItems = "center";

      const icon = document.createElement("img");
      const iconProps = getFileIconProps({
        name: fileName,
        isDir: false,
        className: "size-4 shrink-0",
      });
      icon.src = iconProps.src;
      if (iconProps.alt) icon.alt = iconProps.alt;
      icon.className = "size-4 shrink-0";

      wrapper.appendChild(icon);
      return wrapper;
    };

    const instance = new UnresolvedFile({
      theme,
      // Read-only for PR Checks when the PR may not be the current workspace.
      mergeConflictActionsType: readOnly ? "none" : "default",
      maxContextLines: 16,
      renderHeaderPrefix: headerPrefix,
      onMergeConflictResolve: readOnly
        ? undefined
        : (nextFile) => {
            onResolved(nextFile);
          },
    });

    instance.render({ file, containerWrapper: container });

    return () => {
      instance.cleanUp();
      container.innerHTML = "";
    };
  }, [file, fileName, onResolved, readOnly, theme]);

  return <div ref={containerRef} className="w-full" />;
}

export function GitConflictResolver({
  readOnly = false,
  focusPath,
  editorPath,
}: {
  /** Hide accept/reject actions (view conflict markers only). */
  readOnly?: boolean;
  /** When set (and not merge-conflicts), only render this relative path. */
  focusPath?: string | null;
  /** Full editor path (keeps PR encoding for read-only preview). */
  editorPath?: string | null;
} = {}) {
  const { resolvedTheme } = useTheme();
  const { currentRepoPath, stageFiles } = useGitStore();
  const worktreeQuery = useGitChangedFilesQuery(currentRepoPath);
  const stagedFiles = worktreeQuery.data?.staged_files ?? [];
  const unstagedFiles = worktreeQuery.data?.unstaged_files ?? [];

  // Prefer PR preview contents (merge-tree / merge-file) for read-only PR checks.
  const prPreview = usePrConflictPreviewStore((s) => s.preview);
  const prContext = editorPath ? parseConflictResolvePrRef(editorPath) : null;

  const previewMatchesPr =
    prPreview &&
    prContext &&
    prPreview.owner === prContext.owner &&
    prPreview.repo === prContext.repo &&
    prPreview.prNumber === prContext.prNumber
      ? prPreview
      : prPreview && readOnly
        ? prPreview
        : null;

  const worktreeConflictPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const file of [...stagedFiles, ...unstagedFiles]) {
      if (CONFLICT_STATUSES.has(file.status)) {
        paths.add(file.path);
      }
    }
    return Array.from(paths);
  }, [stagedFiles, unstagedFiles]);

  const conflictedFilePaths = useMemo(() => {
    // Read-only PR mode: prefer server-provided conflict path list.
    if (readOnly && previewMatchesPr && previewMatchesPr.files.length > 0) {
      const filePath =
        prContext?.filePath && prContext.filePath !== "merge-conflicts"
          ? prContext.filePath
          : focusPath && focusPath !== "merge-conflicts"
            ? focusPath
            : null;
      if (filePath) {
        return previewMatchesPr.files.includes(filePath)
          ? [filePath]
          : [filePath];
      }
      return [...previewMatchesPr.files];
    }

    let list = [...worktreeConflictPaths];
    if (focusPath && focusPath !== "merge-conflicts") {
      list = list.filter((p) => p === focusPath);
      if (list.length === 0 && readOnly) list = [focusPath];
    }
    return list;
  }, [
    focusPath,
    prContext?.filePath,
    previewMatchesPr,
    readOnly,
    worktreeConflictPaths,
  ]);

  const [files, setFiles] = useState<Record<string, FileContents>>({});
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [savingPaths, setSavingPaths] = useState<Set<string>>(new Set());
  const [errorByPath, setErrorByPath] = useState<Record<string, string>>({});

  const diffTheme = useMemo(
    () => (resolvedTheme === "dark" ? "pierre-dark" : "pierre-light"),
    [resolvedTheme],
  );

  useEffect(() => {
    if (conflictedFilePaths.length === 0) {
      setFiles({});
      setLoadingPaths(new Set());
      setSavingPaths(new Set());
      setErrorByPath({});
      return;
    }

    // Prefer merge-tree contents for read-only PR preview (no local merge required).
    if (readOnly && previewMatchesPr) {
      const loaded: Record<string, FileContents> = {};
      const errors: Record<string, string> = {};
      for (const relativePath of conflictedFilePaths) {
        const content = previewMatchesPr.contents[relativePath];
        if (typeof content === "string" && content.length > 0) {
          loaded[relativePath] = { name: relativePath, contents: content };
        } else {
          errors[relativePath] =
            "No conflict content available for this file (merge-tree did not produce markers).";
        }
      }
      setFiles(loaded);
      setErrorByPath(errors);
      setLoadingPaths(new Set());
      return;
    }

    if (!currentRepoPath) {
      setFiles({});
      setErrorByPath(
        Object.fromEntries(
          conflictedFilePaths.map((p) => [
            p,
            "Open a repository workspace to load conflict files.",
          ]),
        ),
      );
      setLoadingPaths(new Set());
      return;
    }

    setLoadingPaths(new Set(conflictedFilePaths));
    setErrorByPath({});

    let active = true;
    const absolutePaths = conflictedFilePaths.map((relativePath) =>
      toAbsolutePath(currentRepoPath, relativePath),
    );

    void (async () => {
      try {
        const response = await fsApi.readFiles(absolutePaths);
        if (!active) return;

        const resultByPath = new Map(
          response.results.map((result) => [result.path, result]),
        );
        const loadedFiles: Record<string, FileContents> = {};
        const errors: Record<string, string> = {};

        for (let index = 0; index < conflictedFilePaths.length; index += 1) {
          const relativePath = conflictedFilePaths[index];
          const absolutePath = absolutePaths[index];
          const result = resultByPath.get(absolutePath);
          if (result?.file) {
            loadedFiles[relativePath] = {
              name: relativePath,
              contents: result.file.content ?? "",
            };
          } else {
            errors[relativePath] =
              result?.error ?? "Failed to read conflicted file";
          }
        }

        setFiles((prev) => ({ ...prev, ...loadedFiles }));
        setErrorByPath(errors);
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof Error
            ? error.message
            : "Failed to read conflicted files";
        setErrorByPath(
          Object.fromEntries(
            conflictedFilePaths.map((relativePath) => [relativePath, message]),
          ),
        );
      } finally {
        if (active) {
          setLoadingPaths(new Set());
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [conflictedFilePaths, currentRepoPath, previewMatchesPr, readOnly]);

  const handleMergeConflictResolve = useCallback(
    (relativePath: string, resolvedFile: FileContents) => {
      if (readOnly || !currentRepoPath) {
        return;
      }

      setFiles((prev) => ({ ...prev, [relativePath]: resolvedFile }));
      setSavingPaths((prev) => {
        const next = new Set(prev);
        next.add(relativePath);
        return next;
      });

      void (async () => {
        try {
          const absolutePath = toAbsolutePath(currentRepoPath, relativePath);
          await fsApi.writeFile(absolutePath, resolvedFile.contents);
          await stageFiles([relativePath]);
          if (currentRepoPath) {
            await invalidateGitQueries(currentRepoPath);
          }
        } catch (error) {
          const description =
            error instanceof Error
              ? error.message
              : "Failed to write resolved content";
          toastManager.add({
            title: "Failed to save conflict resolution",
            description,
            type: "error",
          });
        } finally {
          setSavingPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
        }
      })();
    },
    [currentRepoPath, readOnly, stageFiles],
  );

  if (conflictedFilePaths.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        {readOnly
          ? previewMatchesPr
            ? "No conflict files in this preview."
            : "No conflict preview data. Re-open the file from the PR Checks tab."
          : !currentRepoPath
            ? "Open a repository workspace to resolve merge conflicts."
            : "No unresolved merge conflicts."}
      </div>
    );
  }

  return (
    <div className="atmos-git-conflict-resolver h-full w-full overflow-auto bg-background">
      {/* Hide Pierre's default change-type SVG; we already inject file-type icons via renderHeaderPrefix. */}
      <style>{`
        .atmos-git-conflict-resolver [data-change-icon] {
          display: none !important;
        }
      `}</style>
      <div className="mx-auto w-full max-w-[1200px] px-5 py-4 space-y-4">
        {readOnly && (
          <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
            Read-only conflict view — accept/reject is disabled because this may
            not be the current workspace branch. Content is generated via
            merge-tree (does not modify your working tree).
          </div>
        )}
        {conflictedFilePaths.map((relativePath) => {
          const file = files[relativePath];
          const isLoading = loadingPaths.has(relativePath);
          const isSaving = savingPaths.has(relativePath);
          const error = errorByPath[relativePath];

          if (isLoading) {
            return (
              <div
                key={relativePath}
                className="rounded-md border border-border/60 bg-card px-3 py-2 text-sm text-muted-foreground flex items-center gap-2"
              >
                <Loader2 className="size-4 animate-spin" />
                <span>Loading {relativePath}...</span>
              </div>
            );
          }

          if (error || !file) {
            return (
              <div
                key={relativePath}
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {relativePath}: {error || "Failed to load conflicted file"}
              </div>
            );
          }

          return (
            <div
              key={relativePath}
              className="rounded-md border border-border/60 overflow-hidden"
            >
              {isSaving && !readOnly && (
                <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border/60 bg-muted/40">
                  Saving resolution...
                </div>
              )}
              <ConflictFileRenderer
                file={file}
                theme={diffTheme}
                readOnly={readOnly}
                onResolved={(nextFile) =>
                  handleMergeConflictResolve(relativePath, nextFile)
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
