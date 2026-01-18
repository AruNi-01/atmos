export interface Workspace {
  id: string;
  name: string;
  branch: string;
  isActive: boolean;
  status: 'clean' | 'modified';
}

export interface Project {
  id: string;
  name: string;
  isOpen: boolean;
  workspaces: Workspace[];
}

export interface Repo {
  id: string;
  name: string;
}

export interface FileChange {
  id: string;
  path: string;
  additions: number;
  deletions: number;
  status: 'M' | 'A' | 'D'; // Modified, Added, Deleted
}

export interface TerminalLine {
  id: number;
  content: string;
  type: 'info' | 'error' | 'success' | 'command';
}

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  isOpen?: boolean;
}