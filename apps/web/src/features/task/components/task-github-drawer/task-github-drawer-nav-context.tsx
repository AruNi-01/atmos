"use client";

import React from "react";
import type { ActionRun } from "@/features/github/components/ActionsPanel";

export type TaskGithubDrawerNav = {
  /** When true, GitHub center-tab openers route into the nested drawer stack. */
  active: boolean;
  openIssue: (params: {
    owner: string;
    repo: string;
    issueNumber: number;
    title?: string | null;
    contextId?: string | null;
  }) => boolean;
  openPullRequest: (params: {
    owner: string;
    repo: string;
    prNumber: number;
    branch: string;
    title?: string | null;
    contextId?: string | null;
  }) => boolean;
  openCommit: (params: {
    owner: string;
    repo: string;
    sha: string;
    subject: string;
    authorName: string;
    contextId?: string | null;
  }) => boolean;
  openActionRun: (params: {
    owner: string;
    repo: string;
    run: ActionRun;
    runId?: number;
    contextId?: string | null;
  }) => boolean;
};

const TaskGithubDrawerNavContext = React.createContext<TaskGithubDrawerNav | null>(
  null,
);

export function TaskGithubDrawerNavProvider({
  value,
  children,
}: {
  value: TaskGithubDrawerNav;
  children: React.ReactNode;
}) {
  return (
    <TaskGithubDrawerNavContext.Provider value={value}>
      {children}
    </TaskGithubDrawerNavContext.Provider>
  );
}

export function useTaskGithubDrawerNav(): TaskGithubDrawerNav | null {
  return React.useContext(TaskGithubDrawerNavContext);
}
