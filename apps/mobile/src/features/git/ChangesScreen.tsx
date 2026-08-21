import { Button, Host } from "@expo/ui";
import { expoUiButtonStretchModifiers } from "@/ui/primitives/expo-ui-button-modifiers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { Section } from "@/ui/layout/app-screen";
import { ChangedFilesList } from "@/features/git/ChangedFilesList";
import { CommitSheet } from "@/features/git/CommitSheet";
import { FileDiffView } from "@/features/git/FileDiffView";
import { changedFilesFromResponse } from "@/features/git/changed-files";
import { useGitStore } from "@/features/git/git-store";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { wsActions } from "@/api/ws-actions";
import type { GitChangedFile } from "@/api/types";
import { colors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import { expoUiSecondaryStyle } from "@/ui/primitives/expo-ui-button-styles";

const buttonStretchModifiers = expoUiButtonStretchModifiers;

export function ChangesScreen({
  repoPath,
}: {
  repoPath: string | null;
}) {
  const theme = useMobileTheme();
  const { client, state: wsState } = useMobileWs();
  const stagedFiles = useGitStore((state) => state.stagedFiles);
  const unstagedFiles = useGitStore((state) => state.unstagedFiles);
  const untrackedFiles = useGitStore((state) => state.untrackedFiles);
  const status = useGitStore((state) => state.status);
  const selectedFilePath = useGitStore((state) => state.selectedFilePath);
  const diffResponseByPath = useGitStore((state) => state.diffResponseByPath);
  const commitMessage = useGitStore((state) => state.commitMessage);
  const commitResultMessage = useGitStore((state) => state.commitResultMessage);
  const setRepoPath = useGitStore((state) => state.setRepoPath);
  const setStatus = useGitStore((state) => state.setStatus);
  const setChangedFiles = useGitStore((state) => state.setChangedFiles);
  const selectFile = useGitStore((state) => state.selectFile);
  const setDiff = useGitStore((state) => state.setDiff);
  const setCommitMessage = useGitStore((state) => state.setCommitMessage);
  const setCommitResultMessage = useGitStore((state) => state.setCommitResultMessage);
  const [error, setError] = useState<string | null>(null);
  const autoRefreshKeyRef = useRef<string | null>(null);
  const isConnected = Boolean(client && repoPath && wsState === "open");
  const unavailableMessage = gitUnavailableMessage(Boolean(repoPath), wsState);

  useEffect(() => {
    setRepoPath(repoPath);
  }, [repoPath, setRepoPath]);

  const refreshChanges = useCallback(async () => {
    if (!client || !repoPath || wsState !== "open") throw new Error(unavailableMessage);
    const [nextStatus, files] = await Promise.all([
      wsActions.gitGetStatus(client, repoPath),
      wsActions.gitChangedFiles(client, repoPath),
    ]);
    return { nextStatus, files };
  }, [client, repoPath, unavailableMessage, wsState]);

  const refresh = useMutation({
    mutationFn: refreshChanges,
    onSuccess: ({ nextStatus, files }) => {
      setStatus(nextStatus);
      setChangedFiles(changedFilesFromResponse(files));
      setError(null);
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Could not refresh Git status."),
  });

  const loadDiff = useMutation({
    mutationFn: async (file: GitChangedFile) => {
      if (!client || !repoPath || wsState !== "open") throw new Error(unavailableMessage);
      return wsActions.gitFileDiff(client, repoPath, file.path, null, Boolean(file.staged));
    },
    onSuccess: (diff) => {
      setDiff(diff);
      selectFile(diff.file_path);
      setError(null);
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Could not load diff."),
  });

  const stageFile = useMutation({
    mutationFn: async (file: GitChangedFile) => {
      if (!client || !repoPath || wsState !== "open") throw new Error(unavailableMessage);
      return wsActions.gitStage(client, repoPath, [file.path]);
    },
    onSuccess: () => refresh.mutate(),
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Stage failed."),
  });

  const unstageFile = useMutation({
    mutationFn: async (file: GitChangedFile) => {
      if (!client || !repoPath || wsState !== "open") throw new Error(unavailableMessage);
      return wsActions.gitUnstage(client, repoPath, [file.path]);
    },
    onSuccess: () => refresh.mutate(),
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Unstage failed."),
  });

  const commit = useMutation({
    mutationFn: async () => {
      if (!client || !repoPath || wsState !== "open") throw new Error(unavailableMessage);
      const message = commitMessage.trim();
      if (!message) throw new Error("Enter a commit message first.");
      return wsActions.gitCommit(client, repoPath, message);
    },
    onSuccess: (response) => {
      setCommitMessage("");
      setCommitResultMessage(response.commit_hash ? `Committed ${response.commit_hash.slice(0, 8)}.` : "Commit created.");
      setError(null);
      refresh.mutate();
    },
    onError: (nextError) => {
      setCommitResultMessage(null);
      setError(nextError instanceof Error ? nextError.message : "Commit failed.");
    },
  });

  const push = useMutation({
    mutationFn: async () => {
      if (!client || !repoPath || wsState !== "open") throw new Error(unavailableMessage);
      return wsActions.gitPush(client, repoPath);
    },
    onSuccess: () => {
      setCommitResultMessage("Pushed commits.");
      setError(null);
      refresh.mutate();
    },
    onError: (nextError) => {
      setCommitResultMessage(null);
      setError(nextError instanceof Error ? nextError.message : "Push failed.");
    },
  });

  const selectedDiff = useMemo(
    () => (selectedFilePath ? diffResponseByPath[selectedFilePath] : null),
    [diffResponseByPath, selectedFilePath],
  );

  useEffect(() => {
    if (!isConnected || !repoPath) return;
    const refreshKey = repoPath;
    if (autoRefreshKeyRef.current === refreshKey) return;
    autoRefreshKeyRef.current = refreshKey;
    refresh.mutate();
  }, [isConnected, repoPath, refresh]);

  return (
    <View style={styles.root}>
      <Section label="Changes">
        <View style={styles.toolbar}>
          {!isConnected ? (
            <Text selectable style={[styles.disconnected, { color: theme.colors.red }]}>
              {unavailableMessage}
            </Text>
          ) : null}
          {(() => {
            const refreshDisabled = !isConnected || refresh.isPending;
            const refreshStyle = expoUiSecondaryStyle(theme.colors, refreshDisabled);
            return (
              <Host
                matchContents={{ vertical: true }}
                colorScheme={theme.colorScheme}
                seedColor={refreshStyle.seedColor}
                style={styles.stretchHost}
              >
                <Button
                  disabled={refreshDisabled}
                  label={refresh.isPending ? "Refreshing..." : "Refresh"}
                  onPress={refreshDisabled ? undefined : () => refresh.mutate()}
                  modifiers={buttonStretchModifiers}
                  style={refreshStyle.style}
                  variant={refreshStyle.variant}
                />
              </Host>
            );
          })()}
        </View>
        <ChangedFilesList
          stagedFiles={stagedFiles}
          unstagedFiles={unstagedFiles}
          untrackedFiles={untrackedFiles}
          onOpenFile={(file) => {
            if (isConnected) loadDiff.mutate(file);
          }}
          onStage={(file) => stageFile.mutate(file)}
          onUnstage={(file) => unstageFile.mutate(file)}
          actionsDisabled={!isConnected || stageFile.isPending || unstageFile.isPending}
        />
        <FileDiffView diff={selectedDiff} />
      </Section>

      <Section label="Commit">
        <CommitSheet
          message={commitMessage}
          onChangeMessage={setCommitMessage}
          onCommit={() => commit.mutate()}
          onPush={() => push.mutate()}
          isCommitting={commit.isPending}
          isPushing={push.isPending}
          error={error}
          successMessage={commitResultMessage}
          canCommit={isConnected}
          canPush={isConnected && Boolean(status?.has_unpushed_commits)}
        />
      </Section>
    </View>
  );
}

function gitUnavailableMessage(hasRepoPath: boolean, wsState: string) {
  if (!hasRepoPath) return "Open a workspace before using Changes.";
  if (wsState === "connecting" || wsState === "reconnecting") {
    return "Atmos is reconnecting before Git actions can run.";
  }
  return "Connect to an online Computer before using Changes.";
}

const styles = StyleSheet.create({
  stretchHost: {
    alignSelf: "stretch",
    width: "100%",
  },
  growHost: {
    alignSelf: "stretch",
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  disconnected: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 18,
  },
  root: {
    gap: 16,
  },
  toolbar: {
    padding: 16,
    paddingBottom: 0,
  },
});
