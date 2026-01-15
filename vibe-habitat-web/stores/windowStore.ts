"use client";

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { WindowConfig, WindowType } from '../components/workspace/WindowManager';
import { ResizablePanelConfig } from '../components/workspace/ResizablePanels';

interface WindowState {
  windows: WindowConfig[];
  activeWindowId: string | null;
  layoutMode: 'panels' | 'mosaic' | 'split';
  panels: ResizablePanelConfig[];
  direction: 'horizontal' | 'vertical';
}

interface WindowActions {
  addWindow: (window: WindowConfig) => void;
  removeWindow: (windowId: string) => void;
  updateWindow: (windowId: string, updates: Partial<WindowConfig>) => void;
  setActiveWindow: (windowId: string | null) => void;
  setLayoutMode: (mode: 'panels' | 'mosaic' | 'split') => void;
  setDirection: (direction: 'horizontal' | 'vertical') => void;
  addPanel: (panel: ResizablePanelConfig) => void;
  removePanel: (panelId: string) => void;
  updatePanel: (panelId: string, updates: Partial<ResizablePanelConfig>) => void;
  splitWindow: (windowId: string, direction: 'horizontal' | 'vertical') => void;
  resetLayout: () => void;
  saveLayout: (name: string) => void;
  loadLayout: (name: string) => void;
}

interface SavedLayout {
  name: string;
  timestamp: number;
  windows: WindowConfig[];
  panels: ResizablePanelConfig[];
  layoutMode: 'panels' | 'mosaic' | 'split';
  direction: 'horizontal' | 'vertical';
}

interface LayoutStore extends WindowState, WindowActions {
  savedLayouts: Record<string, SavedLayout>;
  getLayoutNames: () => string[];
}

const createDefaultWindow = (type: WindowType, id: string): WindowConfig => ({
  id,
  type,
  title: type.charAt(0).toUpperCase() + type.slice(1),
  closable: true,
  resizable: true,
  minimizable: true,
});

const createDefaultPanels = (): ResizablePanelConfig[] => [
  {
    id: 'editor-panel',
    title: 'Editor',
    content: null,
    defaultSize: 60,
    minSize: 20,
    collapsible: true,
    resizable: true,
  },
  {
    id: 'terminal-panel',
    title: 'Terminal',
    content: null,
    defaultSize: 40,
    minSize: 20,
    collapsible: true,
    resizable: true,
  },
];

export const useWindowStore = create<LayoutStore>()(
  persist(
    (set, get) => ({
      windows: [],
      activeWindowId: null,
      layoutMode: 'panels',
      panels: createDefaultPanels(),
      direction: 'vertical',
      savedLayouts: {},

      addWindow: (window) => set((state) => ({
        windows: [...state.windows, window],
        activeWindowId: window.id,
      })),

      removeWindow: (windowId) => set((state) => {
        const newWindows = state.windows.filter(w => w.id !== windowId);
        return {
          windows: newWindows,
          activeWindowId: state.activeWindowId === windowId 
            ? (newWindows.length > 0 ? newWindows[0].id : null)
            : state.activeWindowId,
        };
      }),

      updateWindow: (windowId, updates) => set((state) => ({
        windows: state.windows.map(w => 
          w.id === windowId ? { ...w, ...updates } : w
        ),
      })),

      setActiveWindow: (windowId) => set({ activeWindowId: windowId }),

      setLayoutMode: (layoutMode) => set({ layoutMode }),

      setDirection: (direction) => set({ direction }),

      addPanel: (panel) => set((state) => ({
        panels: [...state.panels, panel],
      })),

      removePanel: (panelId) => set((state) => ({
        panels: state.panels.filter(p => p.id !== panelId),
      })),

      updatePanel: (panelId, updates) => set((state) => ({
        panels: state.panels.map(p => 
          p.id === panelId ? { ...p, ...updates } : p
        ),
      })),

      splitWindow: (windowId, splitDirection) => set((state) => {
        const windowToSplit = state.windows.find(w => w.id === windowId);
        if (!windowToSplit) return state;

        const newWindow: WindowConfig = {
          ...windowToSplit,
          id: `${windowId}-split-${Date.now()}`,
          title: `${windowToSplit.title} (Copy)`,
        };

        const windowIndex = state.windows.findIndex(w => w.id === windowId);
        const newWindows = [...state.windows];
        newWindows.splice(windowIndex + 1, 0, newWindow);

        return {
          windows: newWindows,
          activeWindowId: newWindow.id,
        };
      }),

      resetLayout: () => set({
        windows: [
          createDefaultWindow('editor', 'main-editor'),
          createDefaultWindow('terminal', 'main-terminal'),
        ],
        panels: createDefaultPanels(),
        activeWindowId: 'main-editor',
        layoutMode: 'panels',
        direction: 'vertical',
      }),

      saveLayout: (name) => set((state) => {
        const layout: SavedLayout = {
          name,
          timestamp: Date.now(),
          windows: state.windows,
          panels: state.panels,
          layoutMode: state.layoutMode,
          direction: state.direction,
        };

        return {
          savedLayouts: {
            ...state.savedLayouts,
            [name]: layout,
          },
        };
      }),

      loadLayout: (name) => set((state) => {
        const layout = state.savedLayouts[name];
        if (!layout) return state;

        return {
          windows: layout.windows,
          panels: layout.panels,
          layoutMode: layout.layoutMode,
          direction: layout.direction,
          activeWindowId: layout.windows.length > 0 ? layout.windows[0].id : null,
        };
      }),

      getLayoutNames: () => Object.keys(get().savedLayouts),
    }),
    {
      name: 'window-layout-store',
      partialize: (state) => ({
        windows: state.windows,
        panels: state.panels,
        layoutMode: state.layoutMode,
        direction: state.direction,
        savedLayouts: state.savedLayouts,
      }),
    }
  )
);

export const useWindows = () => useWindowStore((state) => state.windows);
export const useActiveWindow = () => useWindowStore((state) => 
  state.windows.find(w => w.id === state.activeWindowId)
);
export const usePanels = () => useWindowStore((state) => state.panels);
export const useLayoutMode = () => useWindowStore((state) => state.layoutMode);
export const useLayoutDirection = () => useWindowStore((state) => state.direction);
export const useSavedLayouts = () => useWindowStore((state) => state.savedLayouts);

export const useQuickSetup = () => {
  const { addWindow, setLayoutMode, setDirection, resetLayout } = useWindowStore();

  const setupEditorLayout = () => {
    resetLayout();
    setLayoutMode('panels');
    setDirection('vertical');
  };

  const setupTerminalLayout = () => {
    resetLayout();
    addWindow(createDefaultWindow('terminal', 'main-terminal'));
    addWindow(createDefaultWindow('terminal', 'secondary-terminal'));
    setLayoutMode('panels');
    setDirection('horizontal');
  };

  const setupCoderLayout = () => {
    resetLayout();
    addWindow(createDefaultWindow('editor', 'main-editor'));
    addWindow(createDefaultWindow('files', 'file-browser'));
    addWindow(createDefaultWindow('terminal', 'main-terminal'));
    addWindow(createDefaultWindow('changes', 'git-changes'));
    setLayoutMode('mosaic');
  };

  const setupDiffLayout = () => {
    resetLayout();
    addWindow(createDefaultWindow('diff', 'diff-view'));
    addWindow(createDefaultWindow('editor', 'code-editor'));
    setLayoutMode('panels');
    setDirection('horizontal');
  };

  return {
    setupEditorLayout,
    setupTerminalLayout,
    setupCoderLayout,
    setupDiffLayout,
  };
};