'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useEffect } from 'react';
import { fsApi } from '@/api/ws-api';
import { toastManager } from '@workspace/ui';
import { detectCodeLanguage } from '@/lib/code-language';

// ===== 类型定义 =====

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  language: string;
  isDirty: boolean;
  isLoading: boolean;
  isPreview: boolean; // Preview mode: italic text, replaced on next single-click
  lastOpenedAt: number;
  lastFocusedAt: number;
}

export interface FileNavigationTarget {
  line: number;
  column?: number;
}

export interface FileTreeRevealTarget {
  path: string;
  workspaceId?: string;
  requestId: number;
}

interface WorkspaceState {
  openFiles: OpenFile[];
  activeFilePath: string | null;
}

interface EditorStore {
  // 状态
  workspaceStates: Record<string, WorkspaceState>;
  navigationTargets: Record<string, Record<string, FileNavigationTarget>>;
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
    options?: { preview?: boolean; line?: number; column?: number }
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
  requestFileTreeReveal: (path: string, workspaceId?: string) => void;
  clearFileTreeRevealTarget: (requestId?: number) => void;
  
  // 辅助方法
  getOpenFiles: (workspaceId?: string) => OpenFile[];
  getActiveFilePath: (workspaceId?: string) => string | null;
  getActiveFile: (workspaceId?: string) => OpenFile | undefined;
  hasUnsavedChanges: (workspaceId?: string) => boolean;
}

function getLanguageFromPath(path: string): string {
  return detectCodeLanguage(path);
}

function isBinaryFile(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase();
    const binaryExts = [
        'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tiff', 
        'pdf', 
        'mp4', 'webm', 'ogg', 'mp3', 'wav', 
        'zip', 'tar', 'gz', '7z', 'rar',
        // Office docs often need special handling, treat as binary for now
        'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'
    ];
    return ext ? binaryExts.includes(ext) : false;
}

function getFileNameFromPath(path: string): string {
  return path.split('/').pop() || path;
}

function getDiffTabName(name: string): string {
  return name.endsWith(' (Diff)') ? name : `${name} (Diff)`;
}

async function readFileWithTimeout(path: string, timeoutMs = 12000) {
  return Promise.race([
    fsApi.readFile(path),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Read timeout: ${path}`)), timeoutMs)
    ),
  ]);
}

function nowTimestamp(): number {
  return Date.now();
}

function touchOpenFile(
  file: OpenFile,
  timestamp: number,
  updates?: Partial<Pick<OpenFile, 'lastOpenedAt' | 'lastFocusedAt' | 'isPreview'>>
): OpenFile {
  return {
    ...file,
    lastOpenedAt: updates?.lastOpenedAt ?? file.lastOpenedAt ?? timestamp,
    lastFocusedAt: updates?.lastFocusedAt ?? file.lastFocusedAt ?? timestamp,
    isPreview: updates?.isPreview ?? file.isPreview,
  };
}

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => ({
      workspaceStates: {},
      navigationTargets: {},
      fileTreeRevealTarget: null,
      currentWorkspaceId: null,
      currentProjectPath: null,
      _hasHydrated: false,
      
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      setWorkspaceId: (id) => set({ currentWorkspaceId: id }),

      setCurrentProjectPath: (path) => set({ currentProjectPath: path }),

      requestFileTreeReveal: (path, workspaceId) =>
        set((state) => ({
          fileTreeRevealTarget: {
            path,
            workspaceId: workspaceId || state.currentWorkspaceId || undefined,
            requestId: Date.now(),
          },
        })),

      clearFileTreeRevealTarget: (requestId) =>
        set((state) => {
          if (!state.fileTreeRevealTarget) return state;
          if (
            typeof requestId === 'number' &&
            state.fileTreeRevealTarget.requestId !== requestId
          ) {
            return state;
          }
          return { fileTreeRevealTarget: null };
        }),

      clearNavigationTarget: (path, workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return;

        set((state) => {
          const workspaceTargets = state.navigationTargets[id];
          if (!workspaceTargets?.[path]) return state;

          const { [path]: _removed, ...remainingTargets } = workspaceTargets;
          return {
            navigationTargets: {
              ...state.navigationTargets,
              [id]: remainingTargets,
            },
          };
        });
      },

      getOpenFiles: (workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return [];
        // Return empty array before hydration to avoid mismatch
        if (!get()._hasHydrated) return [];
        return get().workspaceStates[id]?.openFiles || [];
      },

      getActiveFilePath: (workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return null;
        // Return null before hydration to avoid mismatch
        if (!get()._hasHydrated) return null;
        return get().workspaceStates[id]?.activeFilePath || null;
      },

      openFile: async (path, workspaceId, options) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return;
        const timestamp = nowTimestamp();

        const isPreview = options?.preview ?? true; // Default to preview mode
        const navigationTarget =
          typeof options?.line === 'number' && Number.isFinite(options.line)
            ? {
                line: Math.max(1, Math.floor(options.line)),
                column:
                  typeof options.column === 'number' && Number.isFinite(options.column)
                    ? Math.max(1, Math.floor(options.column))
                    : undefined,
              }
            : null;

        const currentState = get().workspaceStates[id] || { openFiles: [], activeFilePath: null };
        const { openFiles } = currentState;

        const existingFile = openFiles.find(f => f.path === path);
        if (existingFile) {
          set((state) => ({
            workspaceStates: {
              ...state.workspaceStates,
              [id]: {
                ...currentState,
                activeFilePath: path,
                openFiles: currentState.openFiles.map((file) =>
                  file.path === path
                    ? touchOpenFile(file, timestamp, { lastFocusedAt: timestamp })
                    : file
                ),
              }
            },
            navigationTargets: navigationTarget
              ? {
                  ...state.navigationTargets,
                  [id]: {
                    ...(state.navigationTargets[id] || {}),
                    [path]: navigationTarget,
                  },
                }
              : state.navigationTargets,
          }));
          if (existingFile.isLoading) {
            await get().reloadFileContent(path, id);
          }
          return;
        }

        const newFile: OpenFile = {
          path,
          name: getFileNameFromPath(path),
          content: '',
          originalContent: '',
          language: getLanguageFromPath(path),
          isDirty: false,
          isLoading: true,
          isPreview,
          lastOpenedAt: timestamp,
          lastFocusedAt: timestamp,
        };

        // If preview mode, replace existing preview tab instead of adding new one
        let newOpenFiles: OpenFile[];
        if (isPreview) {
          const previewIndex = openFiles.findIndex(f => f.isPreview);
          if (previewIndex !== -1) {
            // Replace the existing preview tab
            newOpenFiles = [...openFiles];
            newOpenFiles[previewIndex] = newFile;
          } else {
            newOpenFiles = [...openFiles, newFile];
          }
        } else {
          newOpenFiles = [...openFiles, newFile];
        }

        set((state) => ({
          workspaceStates: {
            ...state.workspaceStates,
            [id]: {
              ...currentState,
              openFiles: newOpenFiles,
              activeFilePath: path,
            }
          },
          navigationTargets: navigationTarget
            ? {
                ...state.navigationTargets,
                [id]: {
                  ...(state.navigationTargets[id] || {}),
                  [path]: navigationTarget,
                },
              }
            : state.navigationTargets,
        }));

        if (path.startsWith('diff://')) {
          set((state) => {
             const ws = state.workspaceStates[id];
             return {
               workspaceStates: {
                 ...state.workspaceStates,
                 [id]: {
                   ...ws,
                   openFiles: ws.openFiles.map(f => f.path === path ? { ...f, isLoading: false, name: getDiffTabName(f.name) } : f)
                 }
               }
             };
          });
          return;
        }

        // Check if binary - avoid loading content into memory/websocket
        if (isBinaryFile(path)) {
             set((state) => {
                const ws = state.workspaceStates[id];
                return {
                   workspaceStates: {
                     ...state.workspaceStates,
                     [id]: {
                       ...ws,
                       // Use special protocol to indicate streaming/external load
                       openFiles: ws.openFiles.map(f => f.path === path ? { 
                           ...f, 
                           content: `stream://${path}`, 
                           originalContent: `stream://${path}`, 
                           isLoading: false 
                       } : f)
                     }
                   }
                };
             });
             return;
        }

        await get().reloadFileContent(path, id);
      },

      reloadFileContent: async (path, workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return;

        if (path.startsWith('diff://')) {
          set((state) => {
            const ws = state.workspaceStates[id];
            if (!ws) return state;
            return {
              workspaceStates: {
                ...state.workspaceStates,
                [id]: {
                  ...ws,
                  openFiles: ws.openFiles.map(f => f.path === path ? { ...f, isLoading: false, name: getDiffTabName(f.name) } : f)
                }
              }
            };
          });
          return;
        }

        if (isBinaryFile(path)) {
          set((state) => {
            const ws = state.workspaceStates[id];
            if (!ws) return state;
            return {
              workspaceStates: {
                ...state.workspaceStates,
                [id]: {
                  ...ws,
                  openFiles: ws.openFiles.map(f => f.path === path ? {
                    ...f,
                    content: `stream://${path}`,
                    originalContent: `stream://${path}`,
                    isLoading: false
                  } : f)
                }
              }
            };
          });
          return;
        }

        try {
          const response = await readFileWithTimeout(path);
          if (!response.exists || response.content === null) {
            const fileName = path.split('/').pop() || path;
            toastManager.add({
              title: 'File not found',
              description: `"${fileName}" does not exist or has been deleted.`,
              type: 'error',
            });
            set((state) => {
              const ws = state.workspaceStates[id];
              if (!ws) return state;
              const newOpenFiles = ws.openFiles.filter(f => f.path !== path);
              return {
                workspaceStates: {
                  ...state.workspaceStates,
                  [id]: {
                    ...ws,
                    openFiles: newOpenFiles,
                    activeFilePath: ws.activeFilePath === path ? (newOpenFiles[0]?.path || null) : ws.activeFilePath
                  }
                }
              };
            });
            return;
          }
          set((state) => {
            const ws = state.workspaceStates[id];
            if (!ws) return state;
            return {
              workspaceStates: {
                ...state.workspaceStates,
                [id]: {
                  ...ws,
                  openFiles: ws.openFiles.map(f =>
                    f.path === path
                      ? { ...f, content: response.content as string, originalContent: response.content as string, isLoading: false }
                      : f
                  )
                }
              }
            };
          });
        } catch (error) {
          console.error('Failed to read file:', error);
          set((state) => {
            const ws = state.workspaceStates[id];
            if (!ws) return state;
            return {
              workspaceStates: {
                ...state.workspaceStates,
                [id]: {
                  ...ws,
                  openFiles: ws.openFiles.map(f => f.path === path ? { ...f, isLoading: false } : f),
                }
              }
            };
          });
        }
      },

      pinFile: (path, workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return;
        const ws = get().workspaceStates[id];
        if (!ws) return;
        const timestamp = nowTimestamp();

        set((state) => ({
          workspaceStates: {
            ...state.workspaceStates,
            [id]: {
              ...ws,
              openFiles: ws.openFiles.map(f => 
                f.path === path
                  ? touchOpenFile(f, timestamp, {
                      isPreview: false,
                      lastFocusedAt: timestamp,
                    })
                  : f
              )
            }
          }
        }));
      },

      closeFile: (path, workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return;
        const ws = get().workspaceStates[id];
        if (!ws) return;
        const timestamp = nowTimestamp();

        const fileIndex = ws.openFiles.findIndex(f => f.path === path);
        if (fileIndex === -1) return;

        const newOpenFiles = ws.openFiles.filter(f => f.path !== path);
        let newActiveFilePath = ws.activeFilePath;
        if (ws.activeFilePath === path) {
          if (newOpenFiles.length > 0) {
            const newIndex = Math.min(fileIndex, newOpenFiles.length - 1);
            newActiveFilePath = newOpenFiles[newIndex].path;
          } else {
            newActiveFilePath = null;
          }
        }

        set((state) => ({
          workspaceStates: {
            ...state.workspaceStates,
            [id]: {
              openFiles: newOpenFiles.map((file) =>
                file.path === newActiveFilePath
                  ? touchOpenFile(file, timestamp, { lastFocusedAt: timestamp })
                  : file
              ),
              activeFilePath: newActiveFilePath,
            }
          }
        }));
      },

      setActiveFile: (path, workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return;
        const timestamp = nowTimestamp();
        set((state) => ({
          workspaceStates: {
            ...state.workspaceStates,
            [id]: {
              ...(state.workspaceStates[id] || { openFiles: [] }),
              activeFilePath: path,
              openFiles: (state.workspaceStates[id]?.openFiles || []).map((file) =>
                file.path === path
                  ? touchOpenFile(file, timestamp, { lastFocusedAt: timestamp })
                  : file
              ),
            }
          }
        }));
      },

      updateFileContent: (path, content, workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return;
        const timestamp = nowTimestamp();
        set((state) => {
          const ws = state.workspaceStates[id];
          if (!ws) return state;
          return {
            workspaceStates: {
              ...state.workspaceStates,
              [id]: {
                ...ws,
                // Editing content pins the file (removes preview mode)
                openFiles: ws.openFiles.map(f =>
                  f.path === path
                    ? {
                        ...touchOpenFile(f, timestamp, {
                          isPreview: false,
                          lastFocusedAt: timestamp,
                        }),
                        content,
                        isDirty: content !== f.originalContent,
                      }
                    : f
                )
              }
            }
          };
        });
      },

      saveFile: async (path, workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return;
        const ws = get().workspaceStates[id];
        const file = ws?.openFiles.find(f => f.path === path);
        if (!file || !file.isDirty) return;

        try {
          await fsApi.writeFile(path, file.content);
          set((state) => {
            const currentWs = state.workspaceStates[id];
            return {
              workspaceStates: {
                ...state.workspaceStates,
                [id]: {
                  ...currentWs,
                  openFiles: currentWs.openFiles.map(f => f.path === path ? { ...f, originalContent: f.content, isDirty: false } : f)
                }
              }
            };
          });
        } catch (error) {
          console.error('Failed to save file:', error);
          throw error;
        }
      },

      saveActiveFile: async (workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return;
        const activePath = get().getActiveFilePath(id);
        if (activePath) {
          await get().saveFile(activePath, id);
        }
      },

      getActiveFile: (workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return undefined;
        // Return undefined before hydration to avoid mismatch
        if (!get()._hasHydrated) return undefined;
        const ws = get().workspaceStates[id];
        return ws?.openFiles.find(f => f.path === ws.activeFilePath);
      },

      hasUnsavedChanges: (workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return false;
        return get().workspaceStates[id]?.openFiles.some(f => f.isDirty) || false;
      },
    }),
    {
      name: 'atmos-editor-storage',
      storage: createJSONStorage(() => sessionStorage),

      partialize: (state) => ({
        // Strip content/originalContent to avoid bloating sessionStorage (~5MB limit)
        workspaceStates: Object.fromEntries(
          Object.entries(state.workspaceStates).map(([wsId, ws]) => [
            wsId,
            {
              ...ws,
              openFiles: ws.openFiles.map(f => ({
                ...f,
                content: '',
                originalContent: '',
                isLoading: true,
                isDirty: false,
                lastOpenedAt: f.lastOpenedAt ?? 0,
                lastFocusedAt: f.lastFocusedAt ?? 0,
              })),
            },
          ])
        ),
        currentWorkspaceId: state.currentWorkspaceId,
        currentProjectPath: state.currentProjectPath,
      }),

      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Reload file content from backend for all restored tabs
        const { workspaceStates } = state;
        for (const [wsId, ws] of Object.entries(workspaceStates)) {
          for (const file of ws.openFiles) {
            useEditorStore.getState().reloadFileContent(file.path, wsId);
          }
        }
      },
    }
  )
);

/**
 * Hook to wait for store hydration before rendering persisted data
 */
export function useEditorStoreHydration() {
  const isReady = useEditorStore((state) => state._hasHydrated);

  useEffect(() => {
    // Mark as hydrated after first client render
    // This ensures SSR and first client render match (both empty)
    // Then the persisted data is restored and triggers a re-render
    useEditorStore.getState().setHasHydrated(true);
  }, []);

  return isReady;
}
