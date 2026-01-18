export interface Workspace {
  id: string;
  name: string;
  branch: string;
  isActive: boolean;
  status: 'clean' | 'modified';
  projectId: string;
}

export interface Project {
  id: string;
  name: string;
  isOpen: boolean;
  workspaces: Workspace[];
  // New fields for storage
  mainFilePath: string;
  sidebarOrder: number;
  borderColor?: string;
}

// Color presets for project border
export const PROJECT_COLOR_PRESETS = [
  { name: 'Red', color: '#ef4444' },
  { name: 'Orange', color: '#f97316' },
  { name: 'Amber', color: '#f59e0b' },
  { name: 'Green', color: '#22c55e' },
  { name: 'Teal', color: '#14b8a6' },
  { name: 'Blue', color: '#3b82f6' },
  { name: 'Indigo', color: '#6366f1' },
  { name: 'Purple', color: '#a855f7' },
  { name: 'Pink', color: '#ec4899' },
  { name: 'None', color: undefined },
] as const;

export type ProjectColorPreset = typeof PROJECT_COLOR_PRESETS[number];

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