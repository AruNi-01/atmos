/** Shared GitHub issue/PR payload shapes (multi-client). */

export type GithubIssueLabelPayload = {
  name: string;
  color: string | null;
  description: string | null;
};

export type GithubIssuePayload = {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: string;
  created_at?: string;
  updated_at?: string;
  labels: GithubIssueLabelPayload[];
};

export type GithubPrPayload = {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: string;
  head_ref: string;
  base_ref: string;
  is_draft: boolean;
  labels: GithubIssueLabelPayload[];
};
