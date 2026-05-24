'use client';

import { create } from 'zustand';
import { useEffect } from 'react';
import { getActiveInstanceId } from '@/features/connection/hooks/use-connection-store';
import { restoreEditorFromInstancePrefs } from '@/features/editor/lib/restore-editor-from-prefs';
import {
  partializeEditorState,
  scheduleEditorUiSave,
} from '@/features/editor/lib/editor-ui-persistence';
import { fsApi } from '@/api/ws-api';
import { toastManager } from '@workspace/ui';
import type { EditorStore, OpenFile } from './editor-store-types';
import {
  applyDiffGroupActiveFile,
  nowTimestamp,
  readFileWithTimeout,
  removeNavigationTargetForPath,
  touchOpenFile,
} from './editor-store-helpers';
import {
  getEditorSourcePath,
  getFileNameFromPath,
  getLanguageFromPath,
  getSpecialTabName,
  isBinaryFile,
  isConflictResolveEditorPath,
  isDiffEditorPath,
  isGroupedDiffEditorPath,
} from './editor-store-paths';

export type {
  FileNavigationTarget,
  FileTreeRevealTarget,
  OpenFile,
} from './editor-store-types';
export {
  EDITOR_CONFLICT_RESOLVE_ALL_PATH,
  EDITOR_CONFLICT_RESOLVE_PREFIX,
  EDITOR_DIFF_PREFIX,
  EDITOR_REVIEW_DIFF_PREFIX,
  EDITOR_REVIEW_GROUP_PREFIX,
  getEditorSourcePath,
  getReviewDiffSnapshotGuid,
  getReviewGroupRevisionGuid,
  isConflictResolveEditorPath,
  isDiffEditorPath,
  isReviewGroupEditorPath,
} from './editor-store-paths';

export const useEditorStore = create<EditorStore>()((set, get) => ({
      workspaceStates: {},
      navigationTargets: {},
      diffGroupActiveFiles: {},
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

      replaceOpenFilePath: (from, to, workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return;

        set((state) => {
          const ws = state.workspaceStates[id];
          if (!ws) return state;

          const nextOpenFiles = ws.openFiles.map((file) => {
            if (file.path === from) {
              return {
                ...file,
                path: to,
                name: getFileNameFromPath(to),
                language: getLanguageFromPath(to),
              };
            }

            const filePrefix = `${from}/`;
            if (file.path.startsWith(filePrefix)) {
              const nextPath = `${to}${file.path.slice(from.length)}`;
              return {
                ...file,
                path: nextPath,
                name: getFileNameFromPath(nextPath),
                language: getLanguageFromPath(nextPath),
              };
            }

            return file;
          });

          const nextActiveFilePath =
            ws.activeFilePath === from
              ? to
              : ws.activeFilePath?.startsWith(`${from}/`)
                ? `${to}${ws.activeFilePath.slice(from.length)}`
                : ws.activeFilePath;

          return {
            workspaceStates: {
              ...state.workspaceStates,
              [id]: {
                ...ws,
                openFiles: nextOpenFiles,
                activeFilePath: nextActiveFilePath,
              },
            },
          };
        });
      },

      closeFilesByPrefix: (prefix, workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return;

        set((state) => {
          const ws = state.workspaceStates[id];
          if (!ws) return state;

          const exactOrChild = (path: string) =>
            path === prefix || path.startsWith(`${prefix}/`);
          const nextOpenFiles = ws.openFiles.filter((file) => !exactOrChild(file.path));
          const nextActiveFilePath = ws.activeFilePath && exactOrChild(ws.activeFilePath)
            ? (nextOpenFiles.at(-1)?.path ?? null)
            : ws.activeFilePath;

          return {
            workspaceStates: {
              ...state.workspaceStates,
              [id]: {
                ...ws,
                openFiles: nextOpenFiles,
                activeFilePath: nextActiveFilePath,
              },
            },
          };
        });
      },

      clearNavigationTarget: (path, workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return;

        set((state) => {
          const workspaceTargets = state.navigationTargets[id];
          if (!workspaceTargets?.[path]) return state;

          const remainingTargets = { ...workspaceTargets };
          delete remainingTargets[path];
          return {
            navigationTargets: {
              ...state.navigationTargets,
              [id]: remainingTargets,
            },
          };
        });
      },

      setDiffGroupActiveFile: (groupPath, filePath, workspaceId) => {
        const id = workspaceId || get().currentWorkspaceId;
        if (!id) return;

        set((state) => {
          const workspaceFiles = { ...(state.diffGroupActiveFiles[id] || {}) };
          if (filePath == null) {
            if (!(groupPath in workspaceFiles)) return state;
            delete workspaceFiles[groupPath];
          } else if (workspaceFiles[groupPath] === filePath) {
            return state;
          } else {
            workspaceFiles[groupPath] = filePath;
          }

          return {
            diffGroupActiveFiles: {
              ...state.diffGroupActiveFiles,
              [id]: workspaceFiles,
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
        const hasLine =
          typeof options?.line === 'number' && Number.isFinite(options.line);
        const hasDiffFilePath =
          typeof options?.diffFilePath === 'string' && options.diffFilePath.length > 0;
        const navigationTarget =
          hasLine || hasDiffFilePath || options?.reviewCommentGuid || options?.reviewMessageGuid
            ? {
                ...(hasLine
                  ? {
                      line: Math.max(1, Math.floor(options!.line!)),
                      column:
                        typeof options?.column === 'number' &&
                        Number.isFinite(options.column)
                          ? Math.max(1, Math.floor(options.column))
                          : undefined,
                    }
                  : {}),
                reviewCommentGuid: options?.reviewCommentGuid,
                reviewMessageGuid: options?.reviewMessageGuid,
                diffFilePath: options?.diffFilePath,
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
              : removeNavigationTargetForPath(state.navigationTargets, id, path),
            diffGroupActiveFiles:
              hasDiffFilePath && isGroupedDiffEditorPath(path)
                ? applyDiffGroupActiveFile(
                    state.diffGroupActiveFiles,
                    id,
                    path,
                    options!.diffFilePath!,
                  )
                : state.diffGroupActiveFiles,
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
          isSymlink: false,
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
            : removeNavigationTargetForPath(state.navigationTargets, id, path),
          diffGroupActiveFiles:
            hasDiffFilePath && isGroupedDiffEditorPath(path)
              ? applyDiffGroupActiveFile(
                  state.diffGroupActiveFiles,
                  id,
                  path,
                  options!.diffFilePath!,
                )
              : state.diffGroupActiveFiles,
        }));

        if (isDiffEditorPath(path) || isConflictResolveEditorPath(path)) {
          set((state) => {
             const ws = state.workspaceStates[id];
             return {
               workspaceStates: {
                  ...state.workspaceStates,
                  [id]: {
                    ...ws,
                    openFiles: ws.openFiles.map(f => f.path === path ? { ...f, isLoading: false, name: getSpecialTabName(path, f.name) } : f)
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
                           content: `stream://${getEditorSourcePath(path)}`,
                           originalContent: `stream://${getEditorSourcePath(path)}`,
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

        if (isDiffEditorPath(path) || isConflictResolveEditorPath(path)) {
          set((state) => {
            const ws = state.workspaceStates[id];
            if (!ws) return state;
            return {
              workspaceStates: {
                ...state.workspaceStates,
                [id]: {
                  ...ws,
                  openFiles: ws.openFiles.map(f => f.path === path ? { ...f, isLoading: false, name: getSpecialTabName(path, f.name) } : f)
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
                    content: `stream://${getEditorSourcePath(path)}`,
                    originalContent: `stream://${getEditorSourcePath(path)}`,
                    isLoading: false
                  } : f)
                }
              }
            };
          });
          return;
        }

        try {
          const response = await readFileWithTimeout(getEditorSourcePath(path));
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
                      ? {
                          ...f,
                          content: response.content as string,
                          originalContent: response.content as string,
                          isSymlink: response.is_symlink,
                          isLoading: false,
                        }
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
        const timestamp = nowTimestamp();

        set((state) => {
          const ws = state.workspaceStates[id];
          if (!ws) return {};
          return {
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
          };
        });
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
          await fsApi.writeFile(getEditorSourcePath(path), file.content);
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
}));

useEditorStore.subscribe((state, prev) => {
  if (
    state.workspaceStates === prev.workspaceStates &&
    state.currentWorkspaceId === prev.currentWorkspaceId &&
    state.currentProjectPath === prev.currentProjectPath
  ) {
    return;
  }
  const instanceId = getActiveInstanceId();
  scheduleEditorUiSave(instanceId, partializeEditorState(state));
});

/**
 * Hook to wait for store hydration before rendering persisted data
 */
export function useEditorStoreHydration() {
  const isReady = useEditorStore((state) => state._hasHydrated);

  useEffect(() => {
    restoreEditorFromInstancePrefs();
  }, []);

  return isReady;
}
