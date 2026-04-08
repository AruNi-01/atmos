"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UnresolvedFile, type FileContents } from "@pierre/diffs";
import { getFileIconProps, Loader2, toastManager } from "@workspace/ui";
import { useTheme } from "next-themes";
import { fsApi } from "@/api/ws-api";
import { useGitStore } from "@/hooks/use-git-store";

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
  onResolved: (nextFile: FileContents) => void;
}

function ConflictFileRenderer({
  file,
  theme,
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
      mergeConflictActionsType: "default",
      maxContextLines: 16,
      renderHeaderPrefix: headerPrefix,
      onMergeConflictResolve: (nextFile) => {
        onResolved(nextFile);
      },
    });

    instance.render({ file, containerWrapper: container });

    return () => {
      instance.cleanUp();
      container.innerHTML = "";
    };
  }, [file, fileName, onResolved, theme]);

  return <div ref={containerRef} className="w-full" />;
}

export function GitConflictResolver() {
  const { resolvedTheme } = useTheme();
  const {
    currentRepoPath,
    stagedFiles,
    unstagedFiles,
    stageFiles,
    refreshChangedFiles,
    refreshGitStatus,
  } = useGitStore();

  const conflictedFilePaths = useMemo(() => {
    const paths = new Set<string>();
    for (const file of [...stagedFiles, ...unstagedFiles]) {
      if (CONFLICT_STATUSES.has(file.status)) {
        paths.add(file.path);
      }
    }
    return Array.from(paths);
  }, [stagedFiles, unstagedFiles]);

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

    void Promise.all(
      conflictedFilePaths.map(async (relativePath) => {
        try {
          const absolutePath = toAbsolutePath(currentRepoPath, relativePath);
          const result = await fsApi.readFile(absolutePath);
          setFiles((prev) => ({
            ...prev,
            [relativePath]: {
              name: relativePath,
              contents: result.content ?? "",
            },
          }));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to read conflicted file";
          setErrorByPath((prev) => ({ ...prev, [relativePath]: message }));
        } finally {
          setLoadingPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
        }
      }),
    );
  }, [conflictedFilePaths, currentRepoPath]);

  const handleMergeConflictResolve = useCallback(
    (relativePath: string, resolvedFile: FileContents) => {
      if (!currentRepoPath) {
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
          await Promise.all([refreshChangedFiles(), refreshGitStatus()]);
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
    [currentRepoPath, refreshChangedFiles, refreshGitStatus],
  );

  if (!currentRepoPath) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        Open a repository workspace to resolve merge conflicts.
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
              {isSaving && (
                <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border/60 bg-muted/40">
                  Saving resolution...
                </div>
              )}
              <ConflictFileRenderer
                file={file}
                theme={diffTheme}
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
