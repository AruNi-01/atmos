"use client";

import React, { useState, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  cn,
  ScrollArea,
  Puzzle,
  Folder,
  Globe,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Loader2,
  getFileIconProps,
  Eye,
  FileText,
  Pencil,
  Lock,
  PreviewCard,
  PreviewCardTrigger,
  PreviewCardPopup,
  Info,
  Panel,
  PanelGroup,
  PanelResizeHandle,
  ImperativePanelHandle,
  toastManager,
  Circle,
  Save,
} from '@workspace/ui';
import { useAppStorage } from "@atmos/shared";
import { useTheme } from 'next-themes';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { MarkdownToc } from '@/components/markdown/MarkdownToc';
import { SkillInfo, SkillFile, fsApi } from '@/api/ws-api';
import { detectCodeLanguage } from '@/lib/code-language';
import { getAgentConfig } from './constants';
import { QuickOpen } from '@/components/layout/QuickOpen';

const CodeMirrorEditor = dynamic(
  () => import('@/components/editor/BaseCodeMirrorEditor').then(mod => mod.BaseCodeMirrorEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

interface SkillDetailProps {
  skill: SkillInfo;
  onBack: () => void;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  file?: SkillFile;
  children: TreeNode[];
}

function FileIcon({ name, isDir, isOpen, className }: { name: string; isDir: boolean; isOpen?: boolean; className?: string }) {
  const iconProps = getFileIconProps({ name, isDir, isOpen, className });
  return <img {...iconProps} />;
}

function buildFileTree(files: SkillFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  
  for (const file of files) {
    const parts = file.relative_path.split('/');
    let current = root;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');
      
      let node = current.find(n => n.name === part);
      if (!node) {
        node = {
          name: part,
          path,
          isDir: !isLast,
          file: isLast ? file : undefined,
          children: [],
        };
        current.push(node);
      }
      current = node.children;
    }
  }
  
  // Sort: directories first, then alphabetically
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach(n => sortNodes(n.children));
  };
  sortNodes(root);
  
  return root;
}

function getLanguageFromFileName(fileName: string): string {
  return detectCodeLanguage(fileName);
}

const TreeItem: React.FC<{
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  expandedDirs: Set<string>;
  onSelect: (file: SkillFile) => void;
  onToggleDir: (path: string) => void;
}> = ({ node, depth, selectedPath, expandedDirs, onSelect, onToggleDir }) => {
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedPath === node.path;

  return (
    <>
      <div
        onClick={() => {
          if (node.isDir) {
            onToggleDir(node.path);
          } else if (node.file) {
            onSelect(node.file);
          }
        }}
        className={cn(
          'flex items-center py-1 px-2 cursor-pointer select-none rounded-none transition-colors',
          'hover:bg-sidebar-accent/50',
          isSelected && 'bg-sidebar-accent text-sidebar-foreground'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.isDir && (
          <ChevronRight
            className={cn(
              'size-3.5 mr-1 transition-transform duration-200 text-muted-foreground',
              isExpanded && 'rotate-90'
            )}
          />
        )}
        {!node.isDir && <span className="w-[18px]" />}
        <span className="mr-2 shrink-0">
          <FileIcon name={node.name} isDir={node.isDir} isOpen={isExpanded} className="size-4" />
        </span>
        <span className="text-[13px] truncate flex-1">{node.name}</span>
        {node.file?.is_main && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary ml-1">Main</span>
        )}
      </div>
      {node.isDir && isExpanded && node.children.map(child => (
        <TreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          expandedDirs={expandedDirs}
          onSelect={onSelect}
          onToggleDir={onToggleDir}
        />
      ))}
    </>
  );
};

interface ResizeHandleProps {
  onCollapse: () => void;
  isCollapsed: boolean;
  side: "left" | "right";
  onDragging: (isDragging: boolean) => void;
  className?: string;
}

function ResizeHandle({
  onCollapse,
  isCollapsed,
  side,
  onDragging,
  className,
}: ResizeHandleProps) {
  return (
    <PanelResizeHandle
      onDragging={onDragging}
      className={cn(
        "relative flex w-px items-center justify-center bg-border transition-colors duration-200 hover:bg-border/80 group touch-none z-10",
        "before:absolute before:inset-y-0 before:-left-1 before:-right-1 before:z-10", // Expand hit area
        className
      )}
    >
      {/* Visual Line (1px inherited from w-px parent) */}

      {/* Collapse Hint Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCollapse();
        }}
        title={isCollapsed ? "Expand" : "Collapse"}
        className={cn(
          "absolute z-50 flex size-5 items-center justify-center rounded-full bg-muted border border-border shadow-lg transition-all duration-200 hover:bg-muted/80 hover:scale-110 opacity-0 group-hover:opacity-100",
          "left-1/2 -translate-x-1/2",
          isCollapsed && "hover:opacity-100! hover:bg-accent!"
        )}
      >
        {side === "left" ? (
          isCollapsed ? (
            <ChevronRight className="size-3 text-muted-foreground" />
          ) : (
            <ChevronLeft className="size-3 text-muted-foreground" />
          )
        ) : isCollapsed ? (
          <ChevronLeft className="size-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground" />
        )}
      </button>
    </PanelResizeHandle>
  );
}

export const SkillDetail: React.FC<SkillDetailProps> = ({ skill, onBack }) => {
  const { resolvedTheme } = useTheme();
  const storage = useAppStorage();
  const fileCount = skill.files?.length || 0;
  
  const [selectedFile, setSelectedFile] = useState<SkillFile | null>(
    skill.files?.find(f => f.is_main) || skill.files?.[0] || null
  );
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    // Expand only the directory of the selected file (if any)
    const dirs = new Set<string>();
    const fileToExpand = skill.files?.find(f => f.is_main) || skill.files?.[0];
    
    if (fileToExpand) {
      const parts = fileToExpand.relative_path.split('/');
      // Add all parent paths
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    }
    return dirs;
  });
  const [isReadOnly, setIsReadOnly] = useState(true);
  const [isPreview, setIsPreview] = useState(true);
  const [fileContent, setFileContent] = useState<string>(selectedFile?.content || '');
  const [isSaving, setIsSaving] = useState(false);

  const [isFilesCollapsed, setIsFilesCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const filesPanelRef = useRef<ImperativePanelHandle>(null);

  const fileTree = useMemo(() => buildFileTree(skill.files || []), [skill.files]);

  const isMarkdown = selectedFile?.name.endsWith('.md') || selectedFile?.name.endsWith('.mdx');
  const language = selectedFile ? getLanguageFromFileName(selectedFile.name) : 'plaintext';
  
  // Dirty check: compare current content with the content in the selectedFile object
  // Note: We need to make sure selectedFile.content is up to date when we save.
  const hasUnsavedChanges = selectedFile ? fileContent !== (selectedFile.content || '') : false;

  const handleToggleDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedFile || !fileContent) return;
    
    setIsSaving(true);
    try {
      const res = await fsApi.writeFile(selectedFile.absolute_path, fileContent);
      if (res.success) {
        // Update the local selectedFile object content to reflect the saved state
        // This is important to reset the dirty state
        selectedFile.content = fileContent;
        
        // Force re-render to update UI (dirty state calculation depends on this)
        // Since we mutated the object, React won't see a "change" in selectedFile prop unless we force it
        // But the dirty check happens in render. 
        // We can just setFileContent to the same value to trigger render, 
        // OR better: update the file in the `skill.files` array via a state update if we had one.
        // Since we don't have a local `files` state, we are mutating the prop/derived state object.
        // To ensure the UI updates, we can update a timestamp or similar, or just re-set fileContent.
        // Actually, since hasUnsavedChanges is derived from fileContent and selectedFile.content,
        // and we mutated selectedFile.content, we need to trigger a render.
        setFileContent(prev => prev); // Dummy update to trigger render? No, primitive equality check.
        // Let's toggle isSaving to false later which triggers render.
        
        toastManager.add({
          title: 'Saved',
          description: `${selectedFile.name} saved successfully`,
          type: 'success',
        });
      } else {
        throw new Error('Failed to write file');
      }
    } catch (err) {
      toastManager.add({
        title: 'Save Failed',
        description: `Failed to save ${selectedFile.name}`,
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  }, [selectedFile, fileContent]);

  const handleSelectFile = useCallback((file: SkillFile) => {
    setSelectedFile(file);
    setFileContent(file.content || '');
    setIsPreview(file.name.endsWith('.md') || file.name.endsWith('.mdx'));
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-border shrink-0">
        <button
          onClick={onBack}
          className="size-8 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="size-5" />
        </button>

        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="size-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Puzzle className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-base truncate">{skill.title || skill.name}</h2>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1 cursor-default uppercase tracking-wider h-5",
                  "bg-muted text-muted-foreground"
                )}>
                  {skill.scope === 'global' ? <Globe className="size-2.5" /> : <Folder className="size-2.5" />}
                  {skill.scope}
                </span>

                {fileCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1 uppercase tracking-wider font-medium h-5">
                    <FileText className="size-2.5" />
                    {fileCount}
                  </span>
                )}

                {skill.description && (
                  <PreviewCard>
                    <PreviewCardTrigger>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground flex items-center gap-1 cursor-help hover:bg-accent transition-colors h-5">
                        <Info className="size-2.5" />
                        Description
                      </span>
                    </PreviewCardTrigger>
                    <PreviewCardPopup align="start" className="w-80">
                      <div className="flex flex-col gap-2 overflow-hidden">
                        <div className="flex flex-col gap-1">
                          <h4 className="font-medium text-sm">Description</h4>
                          <ScrollArea className="max-h-60 overflow-y-auto pr-2">
                            <p className="text-muted-foreground text-xs leading-relaxed">
                              {skill.description}
                            </p>
                          </ScrollArea>
                        </div>
                      </div>
                    </PreviewCardPopup>
                  </PreviewCard>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 flex-wrap overflow-hidden h-[22px]">
              {skill.agents.map((agent) => {
                const config = getAgentConfig(agent);
                return (
                  <span 
                    key={agent} 
                    className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0", config.color)}
                  >
                    {config.name}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* QuickOpen for skill folder */}
        <QuickOpen path={selectedFile?.absolute_path || skill.path} />
      </div>

      {/* Content */}
      <PanelGroup 
        direction="horizontal" 
        className="flex-1 overflow-hidden" 
        autoSaveId="skill-detail-layout" 
        storage={storage}
      >
        {/* File tree sidebar */}
        <Panel 
          ref={filesPanelRef}
          defaultSize={20} 
          minSize={15} 
          maxSize={40} 
          collapsible 
          collapsedSize={0}
          onCollapse={() => setIsFilesCollapsed(true)}
          onExpand={() => setIsFilesCollapsed(false)}
          className={cn(
            "flex flex-col bg-background min-w-0 transition-all duration-300 ease-in-out",
            isDragging && "transition-none"
          )}
        >
          <div className="px-3 h-9 border-b border-border flex items-center justify-between shrink-0">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Files</span>
            <span className="text-[10px] text-muted-foreground">{skill.files?.length || 0}</span>
          </div>
          <ScrollArea className="flex-1">
            <div>
              {fileTree.map(node => (
                <TreeItem
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedFile?.relative_path || null}
                  expandedDirs={expandedDirs}
                  onSelect={handleSelectFile}
                  onToggleDir={handleToggleDir}
                />
              ))}
              {fileTree.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No files</p>
              )}
            </div>
          </ScrollArea>
        </Panel>

        <ResizeHandle 
          onCollapse={() => {
            if (isFilesCollapsed) {
              filesPanelRef.current?.expand();
            } else {
              filesPanelRef.current?.collapse();
            }
          }}
          isCollapsed={isFilesCollapsed}
          side="left"
          onDragging={setIsDragging}
        />

        {/* File content area */}
        <Panel defaultSize={80} className="flex flex-col overflow-hidden min-w-0">
          {selectedFile ? (
            <>
              {/* File toolbar */}
              <div className="flex items-center justify-between px-4 h-9 border-b border-border shrink-0 bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  <FileIcon name={selectedFile.name} isDir={false} className="size-4" />
                  <span className="text-sm font-medium truncate">{selectedFile.relative_path}</span>
                  {hasUnsavedChanges && (
                    <Circle className="size-1.5 fill-current text-primary animate-in fade-in zoom-in duration-200" />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Save button - only show when there are unsaved changes */}
                  {hasUnsavedChanges && (
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors cursor-pointer bg-primary/10 text-primary hover:bg-primary/20"
                      title="Save changes (Cmd+S)"
                    >
                      {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                      <span>Save</span>
                    </button>
                  )}

                  {/* Read-only toggle - Only for non-markdown files */}
                  {!isMarkdown && (
                    <button
                      onClick={() => setIsReadOnly(!isReadOnly)}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors cursor-pointer",
                        isReadOnly 
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" 
                          : "bg-green-500/10 text-green-600 dark:text-green-400"
                      )}
                      title={isReadOnly ? "Click to enable editing" : "Click to make read-only"}
                    >
                      {isReadOnly ? <Lock className="size-3" /> : <Pencil className="size-3" />}
                      {isReadOnly ? 'Read-only' : 'Editing'}
                    </button>
                  )}
                  
                  {/* Markdown preview toggle */}
                  {isMarkdown && (
                    <button
                      onClick={() => {
                        const nextIsPreview = !isPreview;
                        setIsPreview(nextIsPreview);
                        // If switching to editor mode, enable editing automatically
                        if (!nextIsPreview) {
                          setIsReadOnly(false);
                        }
                      }}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      {isPreview ? <FileText className="size-3.5" /> : <Eye className="size-3.5" />}
                      {isPreview ? 'Editor' : 'Preview'}
                    </button>
                  )}
                </div>
              </div>

              {/* Editor / Preview */}
              <div className="flex-1 overflow-hidden relative">
                {selectedFile.content !== null ? (
                  isMarkdown && isPreview ? (
                    <>
                      <ScrollArea className="h-full">
                        <div id="skill-content-root" className="px-8 py-6">
                          <MarkdownRenderer>
                            {fileContent}
                          </MarkdownRenderer>
                        </div>
                      </ScrollArea>
                      <MarkdownToc markdown={fileContent} scrollContainerId="skill-content-root" />
                    </>
                  ) : (
                    <CodeMirrorEditor
                      language={language}
                      value={fileContent}
                      onChange={(value) => !isReadOnly && setFileContent(value)}
                      isReadOnly={isReadOnly}
                      onSave={handleSave}
                    />
                  )
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p className="text-sm">Binary file - content not available</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">Select a file to view its content</p>
            </div>
          )}
        </Panel>
      </PanelGroup>
    </div>
  );
};
