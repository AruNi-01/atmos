'use client';

import { createTranslator } from 'next-intl';
import { toastManager } from '@workspace/ui';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import { currentAppLocale } from '@/shared/lib/current-app-locale';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';
import {
  isWorkspaceSetupProgressEventPayload,
  type WorkspaceSetupProgress,
} from './project-store-setup-progress';

const deleteProgressToasts = new Map<string, { toastId: string; workspaceName: string }>();
let cachedRuntimeLocale: 'en' | 'zh' | null = null;
let cachedRuntimeTranslator: ReturnType<typeof createTranslator> | null = null;

function runtimeT(
  key: string,
  values?: Record<string, string | number>,
): string {
  const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedRuntimeTranslator || cachedRuntimeLocale !== locale) {
    cachedRuntimeLocale = locale;
    cachedRuntimeTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'project.runtime',
    });
  }
  return cachedRuntimeTranslator(key as never, values as never);
}

export function registerWorkspaceDeleteProgressToast(
  workspaceId: string,
  workspaceName: string,
) {
  deleteProgressToasts.set(workspaceId, { toastId: '', workspaceName });
}

export function clearWorkspaceDeleteProgressToast(workspaceId: string) {
  deleteProgressToasts.delete(workspaceId);
}

export function hasWorkspaceDeleteProgressToast(workspaceId: string): boolean {
  return deleteProgressToasts.has(workspaceId);
}

export function subscribeToWorkspaceSetupProgressEvent(
  setSetupProgress: (progress: WorkspaceSetupProgress) => void,
): () => void {
  return useWebSocketStore.getState().onEvent('workspace_setup_progress', (data: unknown) => {
    if (!isWorkspaceSetupProgressEventPayload(data)) return;
    setSetupProgress({
      workspaceId: data.workspace_id,
      status: data.status,
      stepKey: data.step_key,
      failedStepKey: data.failed_step_key,
      stepTitle: data.step_title,
      output: data.output || '',
      replaceOutput: data.replace_output,
      requiresConfirmation: data.requires_confirmation,
      success: data.success,
      countdown: data.countdown,
      setupContext: data.setup_context
        ? {
            hasGithubIssue: data.setup_context.has_github_issue,
            hasGithubPr: !!data.setup_context.has_github_pr,
            hasRequirementStep: data.setup_context.has_requirement_step,
            autoExtractTodos: data.setup_context.auto_extract_todos,
            hasSetupScript: data.setup_context.has_setup_script,
          }
        : undefined,
    });
  });
}

interface WorkspaceDeleteProgressPayload {
  workspace_id: string;
  step: string;
  message: string;
  success: boolean;
}

function isWorkspaceDeleteProgressPayload(data: unknown): data is WorkspaceDeleteProgressPayload {
  return (
    typeof data === 'object' &&
    data !== null &&
    'workspace_id' in data &&
    'step' in data &&
    'message' in data
  );
}

export function subscribeToWorkspaceDeleteProgressEvent(): () => void {
  return useWebSocketStore.getState().onEvent('workspace_delete_progress', (data: unknown) => {
    if (!isWorkspaceDeleteProgressPayload(data)) return;

    const entry = deleteProgressToasts.get(data.workspace_id);
    if (!entry) return;

    const { workspaceName } = entry;

    if (data.step === 'completed') {
      toastManager.add({
        title: runtimeT('common.deleted'),
        description: runtimeT('subscriptions.messages.workspaceRemoved', {
          name: workspaceName,
        }),
        type: 'success',
        timeout: 3000,
      });
      deleteProgressToasts.delete(data.workspace_id);
    } else if (data.step === 'error') {
      toastManager.add({
        title: runtimeT('subscriptions.messages.cleanupWarningTitle'),
        description: runtimeT('subscriptions.messages.workspaceDeletedButCleanupFailed', {
          name: workspaceName,
          message: data.message,
        }),
        type: 'warning',
        timeout: 5000,
      });
      deleteProgressToasts.delete(data.workspace_id);
    }
  });
}

interface WorkspaceGitignoreSyncFailedPayload {
  workspace_id: string;
  message: string;
}

function isWorkspaceGitignoreSyncFailedPayload(
  data: unknown,
): data is WorkspaceGitignoreSyncFailedPayload {
  return (
    typeof data === 'object' &&
    data !== null &&
    'workspace_id' in data &&
    'message' in data
  );
}

export function subscribeToWorkspaceGitignoreSyncFailedEvent(): () => void {
  return useWebSocketStore
    .getState()
    .onEvent('workspace_gitignore_sync_failed', (data: unknown) => {
      if (!isWorkspaceGitignoreSyncFailedPayload(data)) return;

      toastManager.add({
        title: runtimeT('subscriptions.errors.gitignoreSyncFailedTitle'),
        description: data.message,
        type: 'error',
      });
    });
}
