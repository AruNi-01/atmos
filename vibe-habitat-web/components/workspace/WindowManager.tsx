"use client";

import React, { useState, useCallback } from 'react';
import { 
  Group as PanelGroup, 
  Separator as PanelResizeHandle, 
  Panel 
} from 'react-resizable-panels';
import { Terminal } from '../terminal/Terminal';
import Editor from '@monaco-editor/react';
import { X, Maximize2, Minimize2, Copy } from 'lucide-react';

export type WindowType = 'editor' | 'terminal' | 'files' | 'changes' | 'preview' | 'diff';

export interface WindowConfig {
  id: string;
  type: WindowType;
  title: string;
  icon?: React.ReactNode;
  content?: React.ReactNode;
  closable?: boolean;
  resizable?: boolean;
  minimizable?: boolean;
}

export interface WindowManagerProps {
  windows: WindowConfig[];
  onWindowClose?: (windowId: string) => void;
  onWindowSplit?: (windowId: string, direction: 'horizontal' | 'vertical') => void;
  onWindowFocus?: (windowId: string) => void;
  layoutMode?: 'panels' | 'mosaic' | 'split';
  className?: string;
}

const Window: React.FC<{
  config: WindowConfig;
  onClose?: () => void;
  onSplit?: (direction: 'horizontal' | 'vertical') => void;
  onFocus?: () => void;
  isFocused?: boolean;
}> = ({ config, onClose, onSplit, onFocus, isFocused }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const renderContent = useCallback(() => {
    if (config.content) {
      return config.content;
    }

    switch (config.type) {
      case 'editor':
        return (
          <Editor
            height="100%"
            defaultLanguage="typescript"
            defaultValue={`// ${config.title} - Editor Area`}
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
        return <Terminal id={config.id} />;
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
                <span>Modified: components/WindowManager.tsx</span>
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
              <div>Preview Area</div>
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
  }, [config]);

  if (isMinimized) {
    return (
      <div className="h-8 bg-zinc-800 border border-zinc-700 flex items-center px-2">
        <span className="text-xs text-zinc-400">{config.title}</span>
        <button
          onClick={() => setIsMinimized(false)}
          className="ml-auto text-zinc-500 hover:text-zinc-300"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`h-full flex flex-col bg-[#1e1e1e] border ${
        isFocused ? 'border-blue-500' : 'border-zinc-700'
      } rounded-lg overflow-hidden`}
      onClick={onFocus}
    >
      <div className="h-8 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          {config.icon && <span className="text-sm">{config.icon}</span>}
          <span className="text-xs text-zinc-300">{config.title}</span>
        </div>
        <div className="flex items-center gap-1">
          {config.minimizable && (
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1 text-zinc-500 hover:text-zinc-300"
              title="Minimize"
            >
              <Minimize2 className="w-3 h-3" />
            </button>
          )}
          {config.resizable && (
            <div className="flex gap-1">
              <button
                onClick={() => onSplit?.('horizontal')}
                className="p-1 text-zinc-500 hover:text-zinc-300"
                title="Split Horizontal"
              >
                <Copy className="w-3 h-3 rotate-90" />
              </button>
              <button
                onClick={() => onSplit?.('vertical')}
                className="p-1 text-zinc-500 hover:text-zinc-300"
                title="Split Vertical"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
          )}
          {config.closable && onClose && (
            <button
              onClick={onClose}
              className="p-1 text-zinc-500 hover:text-red-400"
              title="Close"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
};

export const WindowManager: React.FC<WindowManagerProps> = ({
  windows,
  onWindowClose,
  onWindowFocus,
  onWindowSplit,
  layoutMode = 'panels',
}) => {
  const [focusedWindow, setFocusedWindow] = useState<string | null>(null);

  const handleWindowFocus = useCallback((windowId: string) => {
    setFocusedWindow(windowId);
    onWindowFocus?.(windowId);
  }, [onWindowFocus]);

  if (windows.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500">
        No windows open
      </div>
    );
  }

  if (windows.length === 1) {
    return (
      <Window
        config={windows[0]}
        onClose={() => onWindowClose?.(windows[0].id)}
        onSplit={(direction) => onWindowSplit?.(windows[0].id, direction)}
        onFocus={() => handleWindowFocus(windows[0].id)}
        isFocused={focusedWindow === windows[0].id}
      />
    );
  }

  const direction = layoutMode === 'split' ? 'horizontal' : 'vertical';

  return (
    <div className="h-full w-full">
      <PanelGroup orientation={direction} className="h-full">
        {windows.map((window, index) => (
          <React.Fragment key={window.id}>
            <Panel defaultSize={100 / windows.length} minSize={10}>
              <div className="h-full w-full">
                <Window
                  config={window}
                  onClose={() => onWindowClose?.(window.id)}
                  onSplit={(dir) => onWindowSplit?.(window.id, dir)}
                  onFocus={() => handleWindowFocus(window.id)}
                  isFocused={focusedWindow === window.id}
                />
              </div>
            </Panel>
            {index < windows.length - 1 && (
              <PanelResizeHandle 
                className={`${direction === 'horizontal' ? 'w-1' : 'h-1'} ${direction === 'horizontal' ? 'cursor-col-resize' : 'cursor-row-resize'} bg-zinc-800 hover:bg-blue-500/50 transition-colors`}
              />
            )}
          </React.Fragment>
        ))}
      </PanelGroup>
    </div>
  );
};