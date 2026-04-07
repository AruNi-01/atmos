"use client";

import React from "react";
import * as PierreDiffsReact from "@pierre/diffs/react";
import type { FileContents } from "@pierre/diffs";
import { Button, toastManager } from "@workspace/ui";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  CheckCircle2,
  Files,
  Loader2,
  RefreshCcw,
  Save,
} from "lucide-react";
import { fsApi, type GitChangedFile } from "@/api/ws-api";
import { cn } from "@/lib/utils";
import { useGitStore } from "@/hooks/use-git-store";

interface ConflictFileCardProps {
  filePath: string;
  theme: "pierre-dark" | "pierre-light";
  onSaved: () => Promise<void>;
}

const CONFLICT_MARKER_PATTERN = /^(<{7}(?: .*)?|={7}|>{7}(?: .*)?)$/m;

const UnresolvedFile = (
  PierreDiffsReact as unknown as {
    UnresolvedFile: React.ComponentType<{
      file: FileContents;
      className?: string;
      options?: {
        theme?: "pierre-dark" | "pierre-light";
        diffStyle?: "split" | "unified";
        overflow?: "scroll" | "wrap" | "hidden";
        maxContextLines?: number;
        onMergeConflictResolve?: (file: FileContents) => void;
      };
    }>;
  }
).UnresolvedFile;

function hasConflictMarkers(contents: string): boolean {
  return CONFLICT_MARKER_PATTERN.test(contents);
}

function isConflictedStatus(status: string): boolean {
  return ["DD", "AU", "UD", "UA", "DU", "AA", "UU", "U"].includes(status);
}

function buildConflictFile(filePath: string, contents: string, size: number): FileContents {
  return {
    name: filePath.split("/").pop() || filePath,
    contents,
    cacheKey: `${filePath}:${size}:${Date.now()}`,
  };
}

function ConflictFileCard({
  filePath,
  theme,
  onSaved,
}: ConflictFileCardProps) {
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sourceFile, setSourceFile] = React.useState<FileContents | null>(null);
  const [workingFile, setWorkingFile] = React.useState<FileContents | null>(null);
  const [loadVersion, setLoadVersion] = React.useState(0);

  const loadFile = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fsApi.readFile(filePath);
      if (!response.exists || response.content == null) {
        throw new Error("The conflicted file no longer exists on disk.");
      }

      const nextFile = buildConflictFile(filePath, response.content, response.size);
      setSourceFile(nextFile);
      setWorkingFile(nextFile);
      setLoadVersion((current) => current + 1);
    } catch (loadError) {
      console.error(loadError);
      setSourceFile(null);
      setWorkingFile(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load conflicted file.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [filePath]);

  React.useEffect(() => {
    void loadFile();
  }, [loadFile]);

  const isDirty = React.useMemo(() => {
    if (!sourceFile || !workingFile) return false;
    return sourceFile.contents !== workingFile.contents;
  }, [sourceFile, workingFile]);

  const hasRemainingConflictMarkers = React.useMemo(
    () => (workingFile ? hasConflictMarkers(workingFile.contents) : false),
    [workingFile],
  );

  const handleSave = React.useCallback(async () => {
    if (!workingFile || !isDirty) return;

    setIsSaving(true);
    try {
      await fsApi.writeFile(filePath, workingFile.contents);
      setSourceFile(workingFile);
      toastManager.add({
        title: "Resolution saved",
        description: `${workingFile.name} was written to disk. Stage it to mark the conflict as resolved in Git.`,
        type: "success",
      });
      await onSaved();
    } catch (saveError) {
      console.error(saveError);
      toastManager.add({
        title: "Failed to save resolution",
        description:
          saveError instanceof Error ? saveError.message : "Unknown error",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }, [filePath, isDirty, onSaved, workingFile]);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            {hasRemainingConflictMarkers ? (
              <AlertTriangle className="size-4 shrink-0 text-amber-500" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            )}
            <span className="truncate text-sm font-medium text-foreground">
              {filePath}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {hasRemainingConflictMarkers
              ? "Choose current, incoming, or both for each conflict block."
              : "All conflict markers are cleared. Save, then stage the file to finish resolution."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadFile()}
            disabled={isSaving}
          >
            <RefreshCcw className="mr-2 size-4" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Save Resolution
          </Button>
        </div>
      </div>

      <div className="border-b border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
        {isLoading
          ? "Loading file..."
          : error
            ? "Unable to load this conflicted file"
            : isDirty
              ? "Unsaved resolution changes"
              : "No unsaved changes"}
      </div>

      <div className="min-h-[180px] p-4">
        {isLoading ? (
          <div className="flex h-[220px] items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-[220px] flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle className="size-7 text-amber-500" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Failed to load conflicted file
              </p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadFile()}>
              <RefreshCcw className="mr-2 size-4" />
              Retry
            </Button>
          </div>
        ) : sourceFile && workingFile && hasConflictMarkers(sourceFile.contents) ? (
          <UnresolvedFile
            key={loadVersion}
            file={sourceFile}
            className={cn(
              "block overflow-hidden rounded-lg border border-border bg-background",
            )}
            options={{
              theme,
              diffStyle: "split",
              overflow: "scroll",
              maxContextLines: 12,
              onMergeConflictResolve: (resolvedFile: FileContents) => {
                setWorkingFile(resolvedFile);
              },
            }}
          />
        ) : (
          <div className="flex h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/10 px-6 text-center">
            <CheckCircle2 className="size-8 text-emerald-500" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                No merge conflict markers found
              </p>
              <p className="text-sm text-muted-foreground">
                This file is already clean on disk. If Git still shows it as
                conflicted, stage it to mark the resolution.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function GitConflictResolver() {
  const { resolvedTheme } = useTheme();
  const refreshRepositoryState = useGitStore((s) => s.refreshRepositoryState);
  const stagedFiles = useGitStore((s) => s.stagedFiles);
  const unstagedFiles = useGitStore((s) => s.unstagedFiles);

  const conflictedFiles = React.useMemo(() => {
    const filesByPath = new Map<string, GitChangedFile>();

    for (const file of [...stagedFiles, ...unstagedFiles]) {
      if (isConflictedStatus(file.status)) {
        filesByPath.set(file.path, file);
      }
    }

    return Array.from(filesByPath.values()).sort((a, b) =>
      a.path.localeCompare(b.path),
    );
  }, [stagedFiles, unstagedFiles]);

  const handleRefresh = React.useCallback(async () => {
    await refreshRepositoryState({ fetchRemote: false });
  }, [refreshRepositoryState]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Files className="size-4 shrink-0 text-amber-500" />
            <span className="truncate text-sm font-medium text-foreground">
              Merge conflict resolution
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Review each conflicted file below. Save the resolved content, then
            stage the file before commit/push.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={() => void handleRefresh()}>
          <RefreshCcw className="mr-2 size-4" />
          Refresh
        </Button>
      </div>

      <div className="border-b border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
        {conflictedFiles.length > 0
          ? `${conflictedFiles.length} conflicted file${conflictedFiles.length > 1 ? "s" : ""} below`
          : "No conflicted files remain in this workspace"}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {conflictedFiles.length > 0 ? (
          <div className="space-y-4">
            {conflictedFiles.map((file) => (
              <ConflictFileCard
                key={file.path}
                filePath={file.path}
                theme={resolvedTheme === "dark" ? "pierre-dark" : "pierre-light"}
                onSaved={handleRefresh}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/10 px-6 text-center">
            <CheckCircle2 className="size-8 text-emerald-500" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                All merge conflicts are cleared
              </p>
              <p className="text-sm text-muted-foreground">
                If you already resolved the files, stage them and continue with
                commit or push.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
