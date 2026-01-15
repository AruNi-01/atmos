"use client";

import React from 'react';
import { WindowManager, WindowConfig } from './WindowManager';
import { ResizablePanelGroup, ResizablePanelConfig } from './ResizablePanels';
import { Terminal } from '../terminal/Terminal';
import Editor from '@monaco-editor/react';
import { 
  useWindowStore, 
  useWindows, 
  usePanels, 
  useLayoutMode, 
  useLayoutDirection,
  useQuickSetup 
} from '@/stores/windowStore';
import { Layout, Monitor, Terminal as TerminalIcon, FileText, GitBranch, Eye } from 'lucide-react';

const createWindowContent = (type: WindowConfig['type']) => {
  switch (type) {
    case 'editor':
      return (
        <Editor 
          height="100%" 
          defaultLanguage="typescript" 
          defaultValue="// VibeHabitat Editor"
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "JetBrains Mono, monospace",
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      );
    case 'terminal':
      return <Terminal id="main-terminal" />;
    case 'files':
      return (
        <div className="p-4 text-zinc-400">
          <div className="space-y-2">
            <div className="flex items-center gap-2 hover:bg-white/5 p-2 rounded">
              <span>📁</span>
              <span>src/</span>
            </div>
            <div className="flex items-center gap-2 hover:bg-white/5 p-2 rounded pl-6">
              <span>📄</span>
              <span>index.tsx</span>
            </div>
          </div>
        </div>
      );
    case 'changes':
      return (
        <div className="p-4 text-zinc-400">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-green-400">
              <span>+</span>
              <span>Modified: components/MosaicLayout.tsx</span>
            </div>
            <div className="flex items-center gap-2 text-red-400">
              <span>-</span>
              <span>Deleted: old-layout.tsx</span>
            </div>
          </div>
        </div>
      );
    case 'preview':
      return (
        <div className="p-4 text-zinc-400 flex items-center justify-center h-full">
          <div className="text-center">
            <div className="text-4xl mb-2">👁️</div>
            <div>Preview</div>
          </div>
        </div>
      );
    case 'diff':
      return (
        <div className="p-4 text-zinc-400">
          <div className="font-mono text-sm">
            <div className="text-green-400">+ added line</div>
            <div className="text-red-400">- removed line</div>
            <div className="text-zinc-400">  unchanged line</div>
          </div>
        </div>
      );
    default:
      return <div className="p-4 text-zinc-400">Unknown window type</div>;
  }
};

const createPanelContent = (panelId: string): React.ReactNode => {
  if (panelId.includes('editor')) {
    return createWindowContent('editor');
  } else if (panelId.includes('terminal')) {
    return createWindowContent('terminal');
  } else if (panelId.includes('files')) {
    return createWindowContent('files');
  } else if (panelId.includes('changes')) {
    return createWindowContent('changes');
  } else if (panelId.includes('preview')) {
    return createWindowContent('preview');
  } else if (panelId.includes('diff')) {
    return createWindowContent('diff');
  }
  return <div className="p-4 text-zinc-400">Panel content</div>;
};

export function MosaicLayout() {
  const windows = useWindows();
  const panels = usePanels();
  const layoutMode = useLayoutMode();
  const direction = useLayoutDirection();
  const { 
    addWindow, 
    removeWindow, 
    setActiveWindow,
    setLayoutMode,
    setDirection,
    resetLayout,
    saveLayout,
    loadLayout
  } = useWindowStore();
  
  const { 
    setupEditorLayout, 
    setupTerminalLayout, 
    setupCoderLayout, 
    setupDiffLayout 
  } = useQuickSetup();

  const handleAddWindow = (type: WindowConfig['type']) => {
    const newWindow: WindowConfig = {
      id: `${type}-${Date.now()}`,
      type,
      title: type.charAt(0).toUpperCase() + type.slice(1),
      closable: true,
      resizable: true,
      minimizable: true,
      content: createWindowContent(type),
    };
    addWindow(newWindow);
  };

  const handlePanelResize = (panelId: string, size: number) => {
  };

  const handlePanelSplit = (panelId: string, splitDirection: 'horizontal' | 'vertical') => {
    const newPanel: ResizablePanelConfig = {
      id: `${panelId}-split-${Date.now()}`,
      title: 'New Panel',
      content: createPanelContent(panelId),
      defaultSize: 50,
      minSize: 10,
      collapsible: true,
      resizable: true,
    };
  };

  const windowConfigs = windows.map(window => ({
    ...window,
    content: window.content || createWindowContent(window.type),
  }));

  const panelConfigs = panels.map(panel => ({
    ...panel,
    content: panel.content || createPanelContent(panel.id),
  }));

  return (
    <div className="h-full w-full flex flex-col">
      <div className="h-10 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">Layout:</span>
            <select 
              value={layoutMode} 
              onChange={(e) => setLayoutMode(e.target.value as any)}
              className="bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded border border-zinc-700"
            >
              <option value="panels">Panels</option>
              <option value="mosaic">Mosaic</option>
              <option value="split">Split</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">Direction:</span>
            <select 
              value={direction} 
              onChange={(e) => setDirection(e.target.value as any)}
              className="bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded border border-zinc-700"
            >
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAddWindow('editor')}
            className="p-1 text-zinc-400 hover:text-zinc-200"
            title="Add Editor"
          >
            <FileText className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleAddWindow('terminal')}
            className="p-1 text-zinc-400 hover:text-zinc-200"
            title="Add Terminal"
          >
            <TerminalIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleAddWindow('files')}
            className="p-1 text-zinc-400 hover:text-zinc-200"
            title="Add Files"
          >
            <Layout className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleAddWindow('changes')}
            className="p-1 text-zinc-400 hover:text-zinc-200"
            title="Add Changes"
          >
            <GitBranch className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleAddWindow('preview')}
            className="p-1 text-zinc-400 hover:text-zinc-200"
            title="Add Preview"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="h-8 bg-zinc-800/50 border-b border-zinc-700 flex items-center gap-2 px-4">
        <button
          onClick={setupEditorLayout}
          className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded"
        >
          Editor Layout
        </button>
        <button
          onClick={setupTerminalLayout}
          className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded"
        >
          Terminal Layout
        </button>
        <button
          onClick={setupCoderLayout}
          className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded"
        >
          Coder Layout
        </button>
        <button
          onClick={setupDiffLayout}
          className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded"
        >
          Diff Layout
        </button>
      </div>

      <div className="flex-1">
        <WindowManager
          windows={windowConfigs}
          layoutMode={layoutMode}
          onWindowClose={removeWindow}
          onWindowFocus={setActiveWindow}
          onWindowSplit={handlePanelSplit}
        />
      </div>
    </div>
  );
}
