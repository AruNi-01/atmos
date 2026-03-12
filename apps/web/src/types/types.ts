export interface Workspace {
  id: string;
  name: string;
  branch: string;
  isActive: boolean;
  status: 'clean' | 'modified';
  projectId: string;
  isPinned: boolean;
  pinnedAt?: string;
  isArchived: boolean;
  archivedAt?: string;
  createdAt: string;
  localPath: string;
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
  targetBranch?: string;
}

// Color presets for project border
export const PROJECT_COLOR_PRESETS = [
  { name: 'Gray', color: '#6b7280' },
  { name: 'Red', color: '#ef4444' },
  { name: 'Orange', color: '#f97316' },
  { name: 'Amber', color: '#f59e0b' },
  { name: 'Yellow', color: '#eab308' },
  { name: 'Green', color: '#22c55e' },
  { name: 'Teal', color: '#14b8a6' },
  { name: 'Blue', color: '#3b82f6' },
  { name: 'Indigo', color: '#6366f1' },
  { name: 'Purple', color: '#a855f7' },
  { name: 'Pink', color: '#ec4899' },
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

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  isOpen?: boolean;
}
