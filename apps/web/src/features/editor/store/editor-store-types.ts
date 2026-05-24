export interface OpenFile {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  language: string;
  isSymlink: boolean;
  isDirty: boolean;
  isLoading: boolean;
  isPreview: boolean; // Preview mode: italic text, replaced on next single-click
  lastOpenedAt: number;
  lastFocusedAt: number;
}

export interface FileNavigationTarget {
  line?: number;
  column?: number;
  reviewCommentGuid?: string;
  reviewMessageGuid?: string;
  /** Scroll to a file within a `diff-group://` CodeView tab */
  diffFilePath?: string;
}

export interface FileTreeRevealTarget {
  path: string;
  workspaceId?: string;
  requestId: number;
}

export interface WorkspaceState {
  openFiles: OpenFile[];
  activeFilePath: string | null;
}

export interface EditorStore {
  // 状态
  workspaceStates: Record<string, WorkspaceState>;
  navigationTargets: Record<string, Record<string, FileNavigationTarget>>;
  /** Sidebar highlight for `diff-group://` tabs (updated on click and while scrolling). */
  diffGroupActiveFiles: Record<string, Record<string, string>>;
  fileTreeRevealTarget: FileTreeRevealTarget | null;
  currentWorkspaceId: string | null;

  // 当前项目路径 (这个可能是全局的或者也是按 workspace 的，根据之前代码暂定全局，但改为按 workspace 更合理)
  currentProjectPath: string | null;

  // Hydration tracking
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;

  // 动作
  setWorkspaceId: (workspaceId: string | null) => void;
  openFile: (
    path: string,
    workspaceId?: string,
    options?: {
      preview?: boolean;
      line?: number;
      column?: number;
      reviewCommentGuid?: string;
      reviewMessageGuid?: string;
      diffFilePath?: string;
    }
  ) => Promise<void>;
  reloadFileContent: (path: string, workspaceId?: string) => Promise<void>;
  pinFile: (path: string, workspaceId?: string) => void;
  closeFile: (path: string, workspaceId?: string) => void;
  setActiveFile: (path: string | null, workspaceId?: string) => void;
  updateFileContent: (path: string, content: string, workspaceId?: string) => void;
  saveFile: (path: string, workspaceId?: string) => Promise<void>;
  saveActiveFile: (workspaceId?: string) => Promise<void>;
  setCurrentProjectPath: (path: string | null) => void;
  clearNavigationTarget: (path: string, workspaceId?: string) => void;
  setDiffGroupActiveFile: (
    groupPath: string,
    filePath: string | null,
    workspaceId?: string,
  ) => void;
  requestFileTreeReveal: (path: string, workspaceId?: string) => void;
  clearFileTreeRevealTarget: (requestId?: number) => void;
  replaceOpenFilePath: (from: string, to: string, workspaceId?: string) => void;
  closeFilesByPrefix: (prefix: string, workspaceId?: string) => void;

  // 辅助方法
  getOpenFiles: (workspaceId?: string) => OpenFile[];
  getActiveFilePath: (workspaceId?: string) => string | null;
  getActiveFile: (workspaceId?: string) => OpenFile | undefined;
  hasUnsavedChanges: (workspaceId?: string) => boolean;
}
