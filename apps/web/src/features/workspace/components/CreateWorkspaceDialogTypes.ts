export interface RepoContext {
  owner: string;
  repo: string;
}

export interface ProjectOption {
  id: string;
  name: string;
}

export type WorkspaceLinkType = 'none' | 'issue' | 'pr';
