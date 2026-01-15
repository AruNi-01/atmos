"use client";

import React, { useState, useCallback, useRef } from 'react';
import { 
  Group as PanelGroup, 
  Separator as PanelResizeHandle, 
  Panel,
  type PanelSize 
} from 'react-resizable-panels';
import { X, Maximize2, Minimize2, Copy, GripVertical } from 'lucide-react';

export interface ResizablePanelConfig {
  id: string;
  title: string;
  content: React.ReactNode;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  collapsible?: boolean;
  resizable?: boolean;
  direction?: 'horizontal' | 'vertical';
}

export interface ResizablePanelGroupProps {
  panels: ResizablePanelConfig[];
  direction?: 'horizontal' | 'vertical';
  className?: string;
  onPanelResize?: (panelId: string, size: number) => void;
  onPanelCollapse?: (panelId: string) => void;
  onPanelExpand?: (panelId: string) => void;
  onPanelClose?: (panelId: string) => void;
  onPanelSplit?: (panelId: string, direction: 'horizontal' | 'vertical') => void;
}

const PanelHeader: React.FC<{
  config: ResizablePanelConfig;
  onClose?: () => void;
  onSplit?: (direction: 'horizontal' | 'vertical') => void;
  onCollapse?: () => void;
  isCollapsed?: boolean;
}> = ({ config, onClose, onSplit, onCollapse, isCollapsed }) => {
  return (
    <div className="h-8 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between px-3">
      <div className="flex items-center gap-2">
        <GripVertical className="w-3 h-3 text-zinc-500" />
        <span className="text-xs text-zinc-300">{config.title}</span>
      </div>
      <div className="flex items-center gap-1">
        {onSplit && (
          <div className="flex gap-1">
            <button
              onClick={() => onSplit('horizontal')}
              className="p-1 text-zinc-500 hover:text-zinc-300"
              title="Split Horizontal"
            >
              <Copy className="w-3 h-3 rotate-90" />
            </button>
            <button
              onClick={() => onSplit('vertical')}
              className="p-1 text-zinc-500 hover:text-zinc-300"
              title="Split Vertical"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
        )}
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="p-1 text-zinc-500 hover:text-zinc-300"
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
          </button>
        )}
        {onClose && (
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
  );
};

const CustomResizeHandle: React.FC<{
  direction: 'horizontal' | 'vertical';
  onDoubleClick?: () => void;
}> = ({ direction, onDoubleClick }) => {
  const isHorizontal = direction === 'horizontal';
  
  return (
    <PanelResizeHandle 
      className={`
        ${isHorizontal ? 'w-1 hover:w-2' : 'h-1 hover:h-2'} 
        bg-zinc-800 hover:bg-blue-500/50 transition-all cursor-${isHorizontal ? 'col' : 'row'}-resize 
        flex items-center justify-center relative z-10
      `}
      onDoubleClick={onDoubleClick}
    >
      <div className={`
        ${isHorizontal ? 'w-1 h-8' : 'w-8 h-1'} 
        rounded-full bg-zinc-600 opacity-0 hover:opacity-100 transition-opacity
      `} />
    </PanelResizeHandle>
  );
};

const ResizablePanelItem: React.FC<{
  config: ResizablePanelConfig;
  onClose?: () => void;
  onSplit?: (direction: 'horizontal' | 'vertical') => void;
  onResize?: (size: number) => void;
  isLast?: boolean;
}> = ({ config, onClose, onSplit, onResize, isLast }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [sizePercentage, setSizePercentage] = useState(config.defaultSize || 50);

  const handleCollapse = useCallback(() => {
    setIsCollapsed(!isCollapsed);
  }, [isCollapsed]);

  const handleResize = useCallback((panelSize: PanelSize) => {
    setSizePercentage(panelSize.asPercentage);
    onResize?.(panelSize.asPercentage);
  }, [onResize]);

  if (isCollapsed) {
    return (
      <Panel 
        defaultSize={2} 
        minSize={1} 
        maxSize={5}
        collapsible={true}
        onResize={handleResize}
      >
        <div className="h-full w-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
          <button
            onClick={handleCollapse}
            className="p-1 text-zinc-500 hover:text-zinc-300"
            title="Expand"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel 
      defaultSize={config.defaultSize || sizePercentage} 
      minSize={config.minSize || 10} 
      maxSize={config.maxSize || 90}
      collapsible={config.collapsible}
      onResize={handleResize}
    >
      <div className="h-full w-full flex flex-col bg-[#1e1e1e] border border-zinc-700 rounded-lg overflow-hidden">
        <PanelHeader
          config={config}
          onClose={onClose}
          onSplit={onSplit}
          onCollapse={handleCollapse}
          isCollapsed={isCollapsed}
        />
        <div className="flex-1 overflow-hidden">
          {config.content}
        </div>
      </div>
    </Panel>
  );
};

export const ResizablePanelGroup: React.FC<ResizablePanelGroupProps> = ({
  panels,
  direction = 'vertical',
  className = '',
  onPanelResize,
  onPanelCollapse,
  onPanelExpand,
  onPanelClose,
  onPanelSplit,
}) => {
  const [panelSizes, setPanelSizes] = useState<Record<string, number>>({});

  const handlePanelResize = useCallback((panelId: string, size: number) => {
    setPanelSizes(prev => ({ ...prev, [panelId]: size }));
    onPanelResize?.(panelId, size);
  }, [onPanelResize]);

  const handlePanelSplit = useCallback((panelId: string, splitDirection: 'horizontal' | 'vertical') => {
    onPanelSplit?.(panelId, splitDirection);
  }, [onPanelSplit]);

  const handleResizeDoubleClick = useCallback(() => {
    const equalSize = 100 / panels.length;
    panels.forEach(panel => {
      handlePanelResize(panel.id, equalSize);
    });
  }, [panels, handlePanelResize]);

  if (panels.length === 0) {
    return (
      <div className={`h-full flex items-center justify-center text-zinc-500 ${className}`}>
        No panels to display
      </div>
    );
  }

  if (panels.length === 1) {
    return (
      <div className={`h-full ${className}`}>
        <ResizablePanelItem
          config={panels[0]}
          onClose={() => onPanelClose?.(panels[0].id)}
          onSplit={(dir) => handlePanelSplit(panels[0].id, dir)}
          onResize={(size) => handlePanelResize(panels[0].id, size)}
          isLast={true}
        />
      </div>
    );
  }

  return (
    <div className={`h-full ${className}`}>
      <PanelGroup 
        orientation={direction} 
        className="h-full w-full"
      >
        {panels.map((panel, index) => (
          <React.Fragment key={panel.id}>
            <ResizablePanelItem
              config={panel}
              onClose={() => onPanelClose?.(panel.id)}
              onSplit={(dir) => handlePanelSplit(panel.id, dir)}
              onResize={(size) => handlePanelResize(panel.id, size)}
              isLast={index === panels.length - 1}
            />
            {index < panels.length - 1 && (
              <CustomResizeHandle 
                direction={direction} 
                onDoubleClick={handleResizeDoubleClick}
              />
            )}
          </React.Fragment>
        ))}
      </PanelGroup>
    </div>
  );
};

export const useResizablePanels = (initialPanels: ResizablePanelConfig[]) => {
  const [panels, setPanels] = useState<ResizablePanelConfig[]>(initialPanels);
  const [panelSizes, setPanelSizes] = useState<Record<string, number>>({});

  const addPanel = useCallback((newPanel: ResizablePanelConfig) => {
    setPanels(prev => [...prev, newPanel]);
  }, []);

  const removePanel = useCallback((panelId: string) => {
    setPanels(prev => prev.filter(p => p.id !== panelId));
    setPanelSizes(prev => {
      const newSizes = { ...prev };
      delete newSizes[panelId];
      return newSizes;
    });
  }, []);

  const updatePanel = useCallback((panelId: string, updates: Partial<ResizablePanelConfig>) => {
    setPanels(prev => prev.map(p => 
      p.id === panelId ? { ...p, ...updates } : p
    ));
  }, []);

  const splitPanel = useCallback((panelId: string, direction: 'horizontal' | 'vertical') => {
    const panelToSplit = panels.find(p => p.id === panelId);
    if (!panelToSplit) return;

    const newPanel: ResizablePanelConfig = {
      ...panelToSplit,
      id: `${panelId}-split-${Date.now()}`,
      title: `${panelToSplit.title} (Copy)`,
      defaultSize: panelToSplit.defaultSize ? panelToSplit.defaultSize / 2 : 50,
    };

    const updatedPanel = {
      ...panelToSplit,
      defaultSize: panelToSplit.defaultSize ? panelToSplit.defaultSize / 2 : 50,
    };

    setPanels(prev => {
      const index = prev.findIndex(p => p.id === panelId);
      if (index === -1) return prev;
      
      const newPanels = [...prev];
      newPanels[index] = updatedPanel;
      newPanels.splice(index + 1, 0, newPanel);
      return newPanels;
    });
  }, [panels]);

  return {
    panels,
    panelSizes,
    addPanel,
    removePanel,
    updatePanel,
    splitPanel,
    setPanels,
  };
};