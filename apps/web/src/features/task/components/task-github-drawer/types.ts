export type TaskGithubDrawerEntry =
  | {
      kind: "issue";
      key: string;
      owner: string;
      repo: string;
      issueNumber: number;
      title?: string | null;
      projectId?: string | null;
    }
  | {
      kind: "pr";
      key: string;
      owner: string;
      repo: string;
      prNumber: number;
      branch: string;
      title?: string | null;
      projectId?: string | null;
    }
  | {
      kind: "commit";
      key: string;
      owner: string;
      repo: string;
      sha: string;
      subject: string;
      authorName: string;
      projectId?: string | null;
    }
  | {
      kind: "action";
      key: string;
      owner: string;
      repo: string;
      runId: number;
      /** Serialized ActionRun payload for ActionsDetailView. */
      run: Record<string, unknown>;
      projectId?: string | null;
    };

export function issueDrawerKey(owner: string, repo: string, issueNumber: number) {
  return `issue:${owner}/${repo}#${issueNumber}`;
}

export function prDrawerKey(owner: string, repo: string, prNumber: number) {
  return `pr:${owner}/${repo}#${prNumber}`;
}

export function commitDrawerKey(owner: string, repo: string, sha: string) {
  return `commit:${owner}/${repo}@${sha}`;
}

export function actionDrawerKey(owner: string, repo: string, runId: number) {
  return `action:${owner}/${repo}#${runId}`;
}
