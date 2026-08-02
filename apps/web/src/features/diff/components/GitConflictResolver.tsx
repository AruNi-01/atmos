"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UnresolvedFile, type FileContents } from "@pierre/diffs";
import { getFileIconProps, Loader2, toastManager } from "@workspace/ui";
import { useTheme } from "next-themes";
import { fsApi } from "@/api/ws-api";
import { useGitStore } from "@/features/git/store/use-git-store";
import { useGitChangedFilesQuery, invalidateGitQueries } from "@/features/git/hooks/use-git-changed-files-query";

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
  const fileName = useMemo(() => file.name.split("/").pop() || file.name, [file.name]);

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
}: {
  /** Hide accept/reject actions (view conflict markers only). */
  readOnly?: boolean;
  /** When set (and not merge-conflicts), only render this relative path. */
  focusPath?: string | null;
} = {}) {
  const { resolvedTheme } = useTheme();
  const { currentRepoPath, stageFiles } = useGitStore();
  const worktreeQuery = useGitChangedFilesQuery(currentRepoPath);
  const stagedFiles = worktreeQuery.data?.staged_files ?? [];
  const unstagedFiles = worktreeQuery.data?.unstaged_files ?? [];

  const conflictedFilePaths = useMemo(() => {
    const paths = new Set<string>();
    for (const file of [...stagedFiles, ...unstagedFiles]) {
      if (CONFLICT_STATUSES.has(file.status)) {
        paths.add(file.path);
      }
    }
    let list = Array.from(paths);
    if (focusPath && focusPath !== "merge-conflicts") {
      list = list.filter((p) => p === focusPath);
      // Still show the focused path even if status map is empty (best-effort).
      if (list.length === 0) list = [focusPath];
    }
    return list;
  }, [focusPath, stagedFiles, unstagedFiles]);

  const [files, setFiles] = useState<Record<string, FileContents>>({});
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [savingPaths, setSavingPaths] = useState<Set<string>>(new Set());
  const [errorByPath, setErrorByPath] = useState<Record<string, string>>({});

  const diffTheme = useMemo(
    () => (resolvedTheme === "dark" ? "pierre-dark" : "pierre-light"),
    [resolvedTheme],
  );

  useEffect(() => {
    if (!currentRepoPath || conflictedFilePaths.length === 0) {
      setFiles({});
      setLoadingPaths(new Set());
      setSavingPaths(new Set());
      setErrorByPath({});
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
          error instanceof Error ? error.message : "Failed to read conflicted files";
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
  }, [conflictedFilePaths, currentRepoPath]);

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
            error instanceof Error ? error.message : "Failed to write resolved content";
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

  if (!currentRepoPath) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        {readOnly
          ? "Open a repository workspace to inspect merge conflicts."
          : "Open a repository workspace to resolve merge conflicts."}
      </div>
    );
  }

  if (conflictedFilePaths.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        No unresolved merge conflicts.
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-background">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-4 space-y-4">
        {readOnly && (
          <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
            Read-only conflict view — accept/reject is disabled because this may not
            be the current workspace branch.
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
            <div key={relativePath} className="rounded-md border border-border/60 overflow-hidden">
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
