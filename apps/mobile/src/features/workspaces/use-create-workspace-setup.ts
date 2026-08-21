import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import type { WorkspaceModel, WorkspaceSetupProgressNotification } from "@/api/types";
import { isWorkspaceSetupProgressNotification } from "@/api/ws-actions";
import type { MobileWsClient } from "@/api/mobile-ws-client";
import {
  cleanSetupOutput,
  isWsNotification,
  type SetupSnapshot,
} from "@/features/workspaces/create-workspace-helpers";

type UseCreateWorkspaceSetupOptions = {
  client: MobileWsClient | null;
  setError: (error: string | null) => void;
};

/**
 * Workspace create → setup progress subscription and snapshot merge.
 * Keeps CreateWorkspaceScreen focused on form fields + mutations + layout.
 */
export function useCreateWorkspaceSetup({
  client,
  setError,
}: UseCreateWorkspaceSetupOptions) {
  const router = useRouter();
  const [createdWorkspace, setCreatedWorkspace] = useState<WorkspaceModel | null>(null);
  const [isAwaitingSetup, setIsAwaitingSetup] = useState(false);
  const [setupProgress, setSetupProgress] =
    useState<WorkspaceSetupProgressNotification | null>(null);
  const [setupOutput, setSetupOutput] = useState("");
  const createdWorkspaceIdRef = useRef<string | null>(null);
  const setupSnapshotsRef = useRef(new Map<string, SetupSnapshot>());

  const applySetupSnapshot = useCallback(
    (snapshot: SetupSnapshot) => {
      const { progress, output } = snapshot;
      setSetupProgress(progress);
      setSetupOutput(output);

      if (progress.status === "completed" && progress.success) {
        setError(null);
        setIsAwaitingSetup(false);
        router.replace(`/workspace/${progress.workspace_id}`);
        return;
      }

      if (progress.status === "error" || !progress.success) {
        setIsAwaitingSetup(false);
        setError(
          progress.output
            ? cleanSetupOutput(progress.output).trim()
            : "Workspace setup failed.",
        );
        return;
      }

      setError(null);
      setIsAwaitingSetup(true);
    },
    [router, setError],
  );

  const recordSetupProgress = useCallback(
    (progress: WorkspaceSetupProgressNotification) => {
      const previous = setupSnapshotsRef.current.get(progress.workspace_id);
      const incomingOutput = progress.output ? cleanSetupOutput(progress.output) : "";
      const output = progress.output
        ? progress.replace_output
          ? incomingOutput
          : `${previous?.output ?? ""}${incomingOutput}`
        : previous?.output ?? "";
      const snapshot = { progress, output };

      setupSnapshotsRef.current.set(progress.workspace_id, snapshot);

      if (createdWorkspaceIdRef.current === progress.workspace_id) {
        applySetupSnapshot(snapshot);
      }
    },
    [applySetupSnapshot],
  );

  useEffect(() => {
    if (!client) return;
    const unsubscribe = client.subscribeMessages((message) => {
      if (!isWsNotification(message) || message.payload.event !== "workspace_setup_progress") {
        return;
      }
      if (!isWorkspaceSetupProgressNotification(message.payload.data)) return;
      recordSetupProgress(message.payload.data);
    });
    return () => {
      unsubscribe();
    };
  }, [client, recordSetupProgress]);

  const beginAwaitingSetup = useCallback(
    (workspace: WorkspaceModel) => {
      createdWorkspaceIdRef.current = workspace.guid;
      setCreatedWorkspace(workspace);
      setError(null);

      const cachedSnapshot = setupSnapshotsRef.current.get(workspace.guid);
      if (cachedSnapshot) {
        applySetupSnapshot(cachedSnapshot);
        return;
      }

      setSetupOutput("");
      setSetupProgress({
        workspace_id: workspace.guid,
        status: "creating",
        step_key: "create_worktree",
        failed_step_key: null,
        step_title: "Preparing Workspace",
        output: null,
        replace_output: false,
        requires_confirmation: false,
        success: true,
        countdown: null,
        setup_context: null,
      });
      setIsAwaitingSetup(true);
    },
    [applySetupSnapshot, setError],
  );

  return {
    beginAwaitingSetup,
    createdWorkspace,
    isAwaitingSetup,
    setIsAwaitingSetup,
    setupOutput,
    setupProgress,
  };
}
