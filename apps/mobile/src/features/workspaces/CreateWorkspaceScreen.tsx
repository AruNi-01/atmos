import { Button, Host } from "@expo/ui";
import { expoUiButtonStretchModifiers } from "@/ui/primitives/expo-ui-button-modifiers";
import { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { NativePicker, NativeSwitch, NativeTextInput } from "@/ui/primitives/native-controls";
import { Row, Separator } from "@/ui/layout/row";
import {
  getCreateWorkspaceReadiness,
  selectCreateWorkspaceProjectGuid,
} from "@/features/workspaces/create-workspace-readiness";
import {
  formatSetupStatus,
  slugify,
} from "@/features/workspaces/create-workspace-helpers";
import { useCreateWorkspaceSetup } from "@/features/workspaces/use-create-workspace-setup";
import { useMobileWs } from "@/providers/MobileWsProvider";

import { useSessionStore } from "@/stores/session-store";
import { wsActions } from "@/api/ws-actions";
import { colors, radii } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import {
  expoUiDangerStyle,
  expoUiPrimaryStyle,
  expoUiSecondaryStyle,
} from "@/ui/primitives/expo-ui-button-styles";

const buttonStretchModifiers = expoUiButtonStretchModifiers;

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
  const {
    beginAwaitingSetup,
    createdWorkspace,
    isAwaitingSetup,
    setIsAwaitingSetup,
    setupOutput,
    setupProgress,
  } = useCreateWorkspaceSetup({ client, setError });

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
      beginAwaitingSetup(workspace);
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
          <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={footerDisabled ? theme.colors.tertiaryLabel : theme.colors.ctaFill}
      style={styles.stretchHost}
    >
      <Button
        disabled={footerDisabled}
        label={footerLabel}
        onPress={(footerDisabled) ? undefined : (() => {
              if (createdWorkspace) {
                router.replace(`/workspace/${createdWorkspace.guid}`);
                return;
              }
              createWorkspace.mutate();
            })}
        modifiers={buttonStretchModifiers}
        style={{
      height: 52,
    }}
        variant="filled"
      />
    </Host>
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
          <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={theme.colors.label}
      style={styles.stretchHost}
    >
      <Button
        label={showAdvanced ? "Hide Advanced" : "Show Advanced"}
        onPress={() => setShowAdvanced((value) => !value)}
        modifiers={buttonStretchModifiers}
        style={{
      height: 52,
    }}
        variant="outlined"
      />
    </Host>
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
                    <View style={styles.inlineAction}>
                      <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={theme.colors.label}
      style={styles.stretchHost}
    >
      <Button
        disabled={labelToAdd === EMPTY_LABEL_VALUE}
        label={"Add"}
        onPress={(labelToAdd === EMPTY_LABEL_VALUE) ? undefined : (() => {
                          if (labelToAdd === EMPTY_LABEL_VALUE) return;
                          setSelectedLabelGuids((current) => [...current, labelToAdd]);
                          setLabelToAdd(EMPTY_LABEL_VALUE);
                        })}
        modifiers={buttonStretchModifiers}
        style={{
      height: 52,
    }}
        variant="outlined"
      />
    </Host>
                    </View>
                  </View>
                  {selectedLabels.map((label) => (
                    <Row
                      key={label.guid}
                      title={label.name}
                      subtitle={label.source}
                      meta={label.color}
                    >
                      <View style={styles.inlineAction}>
                        <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={theme.colors.red}
      style={styles.stretchHost}
    >
      <Button
        label={"Remove"}
        onPress={() => {
                            setSelectedLabelGuids((current) => current.filter((guid) => guid !== label.guid));
                          }}
        modifiers={buttonStretchModifiers}
        style={{
      height: 52,
    }}
        variant="outlined"
      />
    </Host>
                      </View>
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
              <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={confirmTodos.isPending || !setupOutputPreview ? theme.colors.tertiaryLabel : theme.colors.ctaFill}
      style={styles.stretchHost}
    >
      <Button
        disabled={confirmTodos.isPending || !setupOutputPreview}
        label={confirmTodos.isPending ? "Confirming..." : "Confirm TODOs"}
        onPress={(confirmTodos.isPending || !setupOutputPreview) ? undefined : (() => confirmTodos.mutate())}
        modifiers={buttonStretchModifiers}
        style={{
      height: 52,
    }}
        variant="filled"
      />
    </Host>
            ) : null}
            {setupProgress.status === "error" && createdWorkspace ? (
              <View style={styles.progressActions}>
                <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={retrySetup.isPending ? theme.colors.tertiaryLabel : theme.colors.ctaFill}
      style={styles.stretchHost}
    >
      <Button
        disabled={retrySetup.isPending}
        label={retrySetup.isPending ? "Retrying..." : "Retry Setup"}
        onPress={(retrySetup.isPending) ? undefined : (() => retrySetup.mutate())}
        modifiers={buttonStretchModifiers}
        style={{
      height: 52,
    }}
        variant="filled"
      />
    </Host>
                <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={theme.colors.label}
      style={styles.stretchHost}
    >
      <Button
        label={"Open Workspace"}
        onPress={() => router.replace(`/workspace/${createdWorkspace.guid}`)}
        modifiers={buttonStretchModifiers}
        style={{
      height: 52,
    }}
        variant="outlined"
      />
    </Host>
              </View>
            ) : null}
          </View>
        </Section>
      ) : null}

      <InlineError message={error ?? (bootstrap.error instanceof Error ? bootstrap.error.message : null)} />
    </AppScreen>
  );
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
  inlineAction: {
    minWidth: 96,
  },
  labelPicker: {
    flex: 1,
    minWidth: 0,
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
