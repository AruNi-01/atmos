'use client';

import { create } from 'zustand';

import type { TerminalAgentRunConfigInput } from '@/features/agent/lib/terminal-agent-run-config';

export type WorkspaceCreateJobPhase = 'creating' | 'bound';

export interface WorkspaceCreateJob {
  id: string;
  workspaceId: string | null;
  label: string | null;
  originKey: string;
  phase: WorkspaceCreateJobPhase;
  createdAt: number;
}

export function getWorkspaceCreateOriginKey(input: {
  currentView: string;
  workspaceId: string | null;
  projectId: string | null;
}): string {
  if (input.workspaceId) return `workspace:${input.workspaceId}`;
  if (input.projectId) return `project:${input.projectId}`;
  return `view:${input.currentView}`;
}

export function selectAutoOpenWorkspaceId(input: {
  jobs: WorkspaceCreateJob[];
  latestJobId: string | null;
  autoOpenedWorkspaceId: string | null;
  currentOriginKey: string;
  currentWorkspaceId: string | null;
  isEnterable: (workspaceId: string) => boolean;
}): string | null {
  const latest = input.jobs.find((job) => job.id === input.latestJobId);
  if (!latest?.workspaceId) return null;
  if (latest.originKey !== input.currentOriginKey) return null;
  if (input.autoOpenedWorkspaceId === latest.workspaceId) return null;
  if (input.currentWorkspaceId === latest.workspaceId) return null;
  if (!input.isEnterable(latest.workspaceId)) return null;
  return latest.workspaceId;
}

export interface PendingWorkspaceAgentRun {
  workspaceId?: string | null;
  projectId?: string | null;
  prompt: string;
  command?: string;
  agentRunConfig?: TerminalAgentRunConfigInput | null;
  agent?: {
    id: string;
    label: string;
    command: string;
    launchCommand?: string;
    iconType: "built-in" | "custom";
  };
  createdAt: number;
}

interface WorkspaceCreationState {
  jobs: WorkspaceCreateJob[];
  latestJobId: string | null;
  autoOpenedWorkspaceId: string | null;
  pendingAgentRun: PendingWorkspaceAgentRun | null;
  startCreating: (input: { originKey: string; label?: string | null }) => string;
  bindWorkspace: (jobId: string, workspaceId: string, label?: string | null) => void;
  failCreating: (jobId: string) => void;
  markOpened: (workspaceId: string) => void;
  queueAgentRun: (data: Omit<PendingWorkspaceAgentRun, "createdAt">) => void;
  consumeAgentRun: (contextId: string) => PendingWorkspaceAgentRun | null;
}

function createJobId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useWorkspaceCreationStore = create<WorkspaceCreationState>((set) => ({
  jobs: [],
  latestJobId: null,
  autoOpenedWorkspaceId: null,
  pendingAgentRun: null,
  startCreating: ({ originKey, label }) => {
    const id = createJobId();
    set((state) => ({
      jobs: [
        ...state.jobs,
        {
          id,
          workspaceId: null,
          label: label?.trim() || null,
          originKey,
          phase: "creating",
          createdAt: Date.now(),
        },
      ],
      latestJobId: id,
    }));
    return id;
  },
  bindWorkspace: (jobId, workspaceId, label) =>
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              workspaceId,
              label: label?.trim() || job.label,
              phase: "bound",
            }
          : job,
      ),
    })),
  failCreating: (jobId) =>
    set((state) => ({
      jobs: state.jobs.filter((job) => job.id !== jobId),
      latestJobId: state.latestJobId === jobId ? null : state.latestJobId,
    })),
  markOpened: (workspaceId) =>
    set((state) => ({
      autoOpenedWorkspaceId: workspaceId,
      jobs: state.jobs.filter((job) => job.workspaceId !== workspaceId),
      latestJobId:
        state.jobs.find((job) => job.id === state.latestJobId)?.workspaceId === workspaceId
          ? null
          : state.latestJobId,
    })),
  queueAgentRun: ({ workspaceId, projectId, prompt, command, agent, agentRunConfig }) =>
    set({
      pendingAgentRun: {
        workspaceId,
        projectId,
        prompt,
        command,
        agent,
        agentRunConfig,
        createdAt: Date.now(),
      },
    }),
  consumeAgentRun: (contextId) => {
    let pending: PendingWorkspaceAgentRun | null = null;
    set((state) => {
      const pendingContextId = state.pendingAgentRun?.workspaceId ?? state.pendingAgentRun?.projectId;
      if (pendingContextId !== contextId) {
        return state;
      }
      pending = state.pendingAgentRun;
      return { pendingAgentRun: null };
    });
    return pending;
  },
}));
