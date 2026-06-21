import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { NativeButton, NativePicker, NativeSwitch, NativeTextInput } from "@/ui/primitives/native-controls";
import { Row, Separator } from "@/ui/layout/row";
import {
  getCreateWorkspaceReadiness,
  selectCreateWorkspaceProjectGuid,
} from "@/features/workspaces/create-workspace-readiness";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { isWorkspaceSetupProgressNotification, wsActions } from "@/api/ws-actions";
import type { WorkspaceModel, WorkspaceSetupProgressNotification, WsNotification } from "@/api/types";
import { colors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";

const PRIORITY_OPTIONS = [
  { label: "No priority", value: "no_priority" },
  { label: "Urgent", value: "urgent" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

const STATUS_OPTIONS = [
  { label: "Backlog", value: "backlog" },
  { label: "Todo", value: "todo" },
  { label: "In progress", value: "in_progress" },
  { label: "In review", value: "in_review" },
  { label: "Blocked", value: "blocked" },
  { label: "Completed", value: "completed" },
  { label: "Canceled", value: "canceled" },
];

const EMPTY_LABEL_VALUE = "__none__";
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;

type SetupSnapshot = {
  progress: WorkspaceSetupProgressNotification;
  output: string;
};

export function CreateWorkspaceScreen({ initialProjectGuid }: { initialProjectGuid?: string | null }) {
  const router = useRouter();
  const theme = useMobileTheme();
  const { client, state } = useMobileWs();
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
  const isConnected = Boolean(client && state === "open");
  const [projectGuid, setProjectGuid] = useState("");
  const [title, setTitle] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [internalName, setInternalName] = useState("");
  const [issueUrl, setIssueUrl] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [autoExtractTodos, setAutoExtractTodos] = useState(false);
  const [priority, setPriority] = useState("no_priority");
  const [workflowStatus, setWorkflowStatus] = useState("in_progress");
  const [selectedLabelGuids, setSelectedLabelGuids] = useState<string[]>([]);
  const [labelToAdd, setLabelToAdd] = useState(EMPTY_LABEL_VALUE);
  const [error, setError] = useState<string | null>(null);
  const [createdWorkspace, setCreatedWorkspace] = useState<WorkspaceModel | null>(null);
  const [isAwaitingSetup, setIsAwaitingSetup] = useState(false);
  const [setupProgress, setSetupProgress] = useState<WorkspaceSetupProgressNotification | null>(null);
  const [setupOutput, setSetupOutput] = useState("");
  const createdWorkspaceIdRef = useRef<string | null>(null);
  const setupSnapshotsRef = useRef(new Map<string, SetupSnapshot>());

  const bootstrap = useQuery({
    queryKey: ["workspace-bootstrap", selectedServerId, state],
    enabled: isConnected,
    queryFn: () => wsActions.projectWorkspaceBootstrap(client!),
  });

  const projects = bootstrap.data?.projects ?? [];
  const labels = bootstrap.data?.workspace_labels ?? [];
  const projectOptions = useMemo(
    () => projects.map((project) => ({ label: project.name, value: project.guid })),
    [projects],
  );
  const labelOptions = useMemo(
    () => [
      { label: "Select label", value: EMPTY_LABEL_VALUE },
      ...labels
        .filter((label) => !selectedLabelGuids.includes(label.guid))
        .map((label) => ({ label: label.name, value: label.guid })),
    ],
    [labels, selectedLabelGuids],
  );
  const selectedLabels = useMemo(
    () => labels.filter((label) => selectedLabelGuids.includes(label.guid)),
    [labels, selectedLabelGuids],
  );

  useEffect(() => {
    const nextProjectGuid = selectCreateWorkspaceProjectGuid({
      currentProjectGuid: projectGuid,
      initialProjectGuid,
      projectOptions,
    });
    if (nextProjectGuid !== projectGuid) {
      setProjectGuid(nextProjectGuid);
    }
  }, [initialProjectGuid, projectGuid, projectOptions]);

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
        setError(progress.output ? cleanSetupOutput(progress.output).trim() : "Workspace setup failed.");
        return;
      }

      setError(null);
      setIsAwaitingSetup(true);
    },
    [router],
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
      if (!isWsNotification(message) || message.payload.event !== "workspace_setup_progress") return;
      if (!isWorkspaceSetupProgressNotification(message.payload.data)) return;
      recordSetupProgress(message.payload.data);
    });
    return () => {
      unsubscribe();
    };
  }, [client, recordSetupProgress]);

  const createWorkspace = useMutation({
    mutationFn: async () => {
      if (!client || state !== "open") throw new Error("Connect to a Computer first.");
      const readiness = getCreateWorkspaceReadiness({
        isAwaitingSetup,
        isConnected,
        isCreating: false,
        projectGuid,
        title,
      });
      if (!readiness.canCreate) throw new Error(readiness.reason ?? "Workspace creation is not ready.");
      if (issueUrl.trim() && prUrl.trim()) {
        throw new Error("Choose either a GitHub Issue URL or a GitHub PR URL, not both.");
      }
      const githubIssue = issueUrl.trim()
        ? await wsActions.githubIssueGet(client, issueUrl.trim())
        : null;
      const githubPr = prUrl.trim()
        ? await wsActions.githubPrGet(client, prUrl.trim())
        : null;
      const name = slugify(internalName || title);
      const branch = slugify(branchName || internalName || title);
      const workspace = await wsActions.workspaceCreate(client, {
        project_guid: projectGuid,
        name,
        display_name: title.trim(),
        branch,
        base_branch: baseBranch.trim() || null,
        github_issue: githubIssue,
        github_pr: githubPr,
        auto_extract_todos: autoExtractTodos,
        priority,
        workflow_status: workflowStatus,
        label_guids: selectedLabelGuids,
      });
      return workspace;
    },
    onSuccess: (workspace) => {
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
    onError: (nextError) => {
      setError(nextError instanceof Error ? nextError.message : "Workspace creation failed.");
      setIsAwaitingSetup(false);
    },
  });

  const confirmTodos = useMutation({
    mutationFn: async () => {
      if (!client || state !== "open" || !createdWorkspace) throw new Error("Workspace setup is not ready.");
      if (!setupOutput.trim()) throw new Error("No generated TODO content is available.");
      return wsActions.workspaceConfirmTodos(client, createdWorkspace.guid, setupOutput);
    },
    onSuccess: () => {
      setError(null);
      setIsAwaitingSetup(true);
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Could not continue setup."),
  });

  const retrySetup = useMutation({
    mutationFn: async () => {
      if (!client || state !== "open" || !createdWorkspace || !setupProgress) {
        throw new Error("Workspace setup is not ready.");
      }
      return wsActions.workspaceRetrySetup(client, {
        guid: createdWorkspace.guid,
        failed_step_key: setupProgress.failed_step_key ?? setupProgress.step_key ?? "run_setup_script",
        github_issue: createdWorkspace.github_issue,
        github_pr: createdWorkspace.github_pr,
        auto_extract_todos: setupProgress.setup_context?.auto_extract_todos ?? autoExtractTodos,
      });
    },
    onSuccess: () => {
      setError(null);
      setIsAwaitingSetup(true);
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Could not retry setup."),
  });

  const footerLabel = createdWorkspace
    ? setupProgress?.status === "error"
      ? "Open Workspace"
      : "Setting Up..."
    : createWorkspace.isPending
      ? "Creating..."
      : "Create Workspace";
  const createReadiness = getCreateWorkspaceReadiness({
    isAwaitingSetup,
    isConnected,
    isCreating: createWorkspace.isPending,
    projectGuid,
    title,
  });
  const footerDisabled = createdWorkspace
    ? setupProgress?.status !== "error"
    : !createReadiness.canCreate;
  const setupOutputPreview = setupOutput.trim();

  return (
    <AppScreen
      surface="sheet"
      footer={
        <View style={styles.footer}>
          <NativeButton
            label={footerLabel}
            disabled={footerDisabled}
            onPress={() => {
              if (createdWorkspace) {
                router.replace(`/workspace/${createdWorkspace.guid}`);
                return;
              }
              createWorkspace.mutate();
            }}
          />
          {!createdWorkspace && createReadiness.reason ? (
            <Text selectable style={[styles.footerHint, { color: theme.colors.secondaryLabel }]}>
              {createReadiness.reason}
            </Text>
          ) : null}
        </View>
      }
    >
      <Section label="Project">
        {projects.length === 0 ? (
          <EmptyState title="No projects loaded" message="Select a Computer, then import a project or refresh workspace data." />
        ) : (
          <View style={styles.block}>
            <NativePicker
              selectedValue={projectGuid || projectOptions[0]?.value}
              onValueChange={(value) => setProjectGuid(String(value))}
              options={projectOptions}
            />
          </View>
        )}
      </Section>

      <Section label="Workspace">
        <View style={styles.block}>
          <NativeTextInput onChangeText={setTitle} placeholder="Workspace title" value={title} />
          <NativeTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setBaseBranch}
            placeholder="Base branch"
            value={baseBranch}
          />
          <NativeButton
            label={showAdvanced ? "Hide Advanced" : "Show Advanced"}
            onPress={() => setShowAdvanced((value) => !value)}
          />
          {showAdvanced ? (
            <View style={styles.advanced}>
              <Separator />
              <Row
                title="Branch naming"
                subtitle="Optional overrides. If empty, mobile derives safe names from the title."
              />
              <NativeTextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setInternalName}
                placeholder="Internal workspace name"
                value={internalName}
              />
              <NativeTextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setBranchName}
                placeholder="feature/mobile-work"
                value={branchName}
              />
              <Separator />
              <Row
                title="GitHub context"
                subtitle="Paste an Issue or PR URL to seed the workspace setup. Use only one."
              />
              <NativeTextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setIssueUrl}
                placeholder="https://github.com/org/repo/issues/123"
                value={issueUrl}
              />
              <NativeTextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setPrUrl}
                placeholder="https://github.com/org/repo/pull/123"
                value={prUrl}
              />
              <View style={styles.switchRow}>
                <NativeSwitch
                  label="Auto extract TODOs"
                  value={autoExtractTodos}
                  onValueChange={setAutoExtractTodos}
                />
              </View>
              <Separator />
              <Row title="Metadata" subtitle="Priority, status, and labels are optional." />
              <NativePicker
                selectedValue={priority}
                onValueChange={(value) => setPriority(String(value))}
                options={PRIORITY_OPTIONS}
              />
              <NativePicker
                selectedValue={workflowStatus}
                onValueChange={(value) => setWorkflowStatus(String(value))}
                options={STATUS_OPTIONS}
              />
              {labels.length > 0 ? (
                <View style={styles.labels}>
                  <View style={styles.labelPickerRow}>
                    <View style={styles.labelPicker}>
                      <NativePicker
                        selectedValue={labelToAdd}
                        onValueChange={(value) => setLabelToAdd(String(value))}
                        options={labelOptions}
                      />
                    </View>
                    <NativeButton
                      label="Add"
                      disabled={labelToAdd === EMPTY_LABEL_VALUE}
                      onPress={() => {
                        if (labelToAdd === EMPTY_LABEL_VALUE) return;
                        setSelectedLabelGuids((current) => [...current, labelToAdd]);
                        setLabelToAdd(EMPTY_LABEL_VALUE);
                      }}
                    />
                  </View>
                  {selectedLabels.map((label) => (
                    <Row
                      key={label.guid}
                      title={label.name}
                      subtitle={label.source}
                      meta={label.color}
                    >
                      <NativeButton
                        label="Remove"
                        onPress={() => {
                          setSelectedLabelGuids((current) => current.filter((guid) => guid !== label.guid));
                        }}
                        variant="text"
                      />
                    </Row>
                  ))}
                </View>
              ) : (
                <Text selectable style={[styles.help, { color: theme.colors.secondaryLabel }]}>
                  No workspace labels are available on this Computer yet.
                </Text>
              )}
            </View>
          ) : null}
        </View>
      </Section>

      {setupProgress ? (
        <Section label="Setup">
          <View style={styles.progressBlock}>
            <Text selectable style={[styles.progressTitle, { color: theme.colors.label }]}>
              {setupProgress.step_title}
            </Text>
            <Text selectable style={[styles.progressMeta, { color: theme.colors.secondaryLabel }]}>
              {formatSetupStatus(setupProgress)}
            </Text>
            {setupOutputPreview ? (
              <View
                style={[
                  styles.outputBox,
                  { backgroundColor: theme.colors.cardElevated, borderColor: theme.colors.separator },
                ]}
              >
                <Text selectable style={[styles.outputText, { color: theme.colors.label }]}>
                  {setupOutputPreview}
                </Text>
              </View>
            ) : null}
            {setupProgress.requires_confirmation ? (
              <NativeButton
                label={confirmTodos.isPending ? "Confirming..." : "Confirm TODOs"}
                disabled={confirmTodos.isPending || !setupOutputPreview}
                onPress={() => confirmTodos.mutate()}
              />
            ) : null}
            {setupProgress.status === "error" && createdWorkspace ? (
              <View style={styles.progressActions}>
                <NativeButton
                  label={retrySetup.isPending ? "Retrying..." : "Retry Setup"}
                  disabled={retrySetup.isPending}
                  onPress={() => retrySetup.mutate()}
                />
                <NativeButton
                  label="Open Workspace"
                  onPress={() => router.replace(`/workspace/${createdWorkspace.guid}`)}
                />
              </View>
            ) : null}
          </View>
        </Section>
      ) : null}

      <InlineError message={error ?? (bootstrap.error instanceof Error ? bootstrap.error.message : null)} />
    </AppScreen>
  );
}

function isWsNotification(message: unknown): message is WsNotification {
  if (!message || typeof message !== "object") return false;
  const envelope = message as Record<string, unknown>;
  if (envelope.type !== "notification") return false;
  const payload = envelope.payload as Record<string, unknown> | undefined;
  return Boolean(payload && typeof payload.event === "string" && "data" in payload);
}

function cleanSetupOutput(value: string) {
  return value.replace(ANSI_PATTERN, "").replace(/\r/g, "");
}

function formatSetupStatus(progress: WorkspaceSetupProgressNotification) {
  if (progress.requires_confirmation) return "Waiting for confirmation";
  if (progress.status === "completed") return "Completed";
  if (progress.status === "error") return "Failed";
  if (progress.status === "setting_up") return "Running setup";
  return "Creating";
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `mobile-${Date.now()}`
  );
}

const styles = StyleSheet.create({
  advanced: {
    gap: 12,
  },
  block: {
    gap: 12,
    padding: 16,
  },
  footer: {
    gap: 8,
  },
  footerHint: {
    color: colors.secondaryLabel,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  help: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
  },
  labelPicker: {
    flex: 1,
  },
  labelPickerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  labels: {
    gap: 8,
  },
  outputBox: {
    backgroundColor: colors.cardElevated,
    borderColor: colors.separator,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: 220,
    padding: 12,
  },
  outputText: {
    color: colors.label,
    fontFamily: "Menlo",
    fontSize: 12,
    lineHeight: 17,
  },
  progressActions: {
    gap: 10,
  },
  progressBlock: {
    gap: 12,
    padding: 16,
  },
  progressMeta: {
    color: colors.secondaryLabel,
    fontSize: 13,
  },
  progressTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: "700",
  },
  switchRow: {
    paddingHorizontal: 4,
  },
});
