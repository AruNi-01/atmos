'use client';

import { create } from 'zustand';
import { fsApi } from '@/api/ws-api';

// ===== 类型定义 =====

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  language: string;
  isDirty: boolean;
  isLoading: boolean;
}

interface EditorStore {
  // 状态
  openFiles: OpenFile[];
  activeFilePath: string | null;
  
  // 当前项目路径
  currentProjectPath: string | null;
  
  // 动作
  openFile: (path: string) => Promise<void>;
  closeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  saveActiveFile: () => Promise<void>;
  setCurrentProjectPath: (path: string | null) => void;
  
  // 辅助方法
  getActiveFile: () => OpenFile | undefined;
  hasUnsavedChanges: () => boolean;
}

// 根据文件扩展名获取语言
function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'mjs': 'javascript',
    'cjs': 'javascript',
    
    // Web
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'less': 'less',
    'json': 'json',
    'xml': 'xml',
    'svg': 'xml',
    
    // Backend
    'rs': 'rust',
    'py': 'python',
    'go': 'go',
    'java': 'java',
    'kt': 'kotlin',
    'rb': 'ruby',
    'php': 'php',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    
    // Config
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml',
    'ini': 'ini',
    'env': 'plaintext',
    
    // Shell
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
    
    // Markdown
    'md': 'markdown',
    'mdx': 'markdown',
    
    // SQL
    'sql': 'sql',
    
    // Other
    'graphql': 'graphql',
    'gql': 'graphql',
    'dockerfile': 'dockerfile',
  };
  
  // Check for special filenames
  const fileName = path.split('/').pop()?.toLowerCase() || '';
  if (fileName === 'dockerfile') return 'dockerfile';
  if (fileName.endsWith('.gitignore') || fileName === '.gitignore') return 'plaintext';
  if (fileName.endsWith('makefile') || fileName === 'makefile') return 'makefile';
  
  return languageMap[ext || ''] || 'plaintext';
}

// 从路径获取文件名
function getFileNameFromPath(path: string): string {
  return path.split('/').pop() || path;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  // 初始状态
  openFiles: [],
  activeFilePath: null,
  currentProjectPath: null,
  
  // 设置当前项目路径
  setCurrentProjectPath: (path) => {
    set({ currentProjectPath: path });
  },
  
  // 打开文件
  openFile: async (path) => {
    const { openFiles } = get();
    
    // 检查文件是否已打开
    const existingFile = openFiles.find(f => f.path === path);
    if (existingFile) {
      set({ activeFilePath: path });
      return;
    }
    
    // 添加一个加载状态的文件
    const newFile: OpenFile = {
      path,
      name: getFileNameFromPath(path),
      content: '',
      originalContent: '',
      language: getLanguageFromPath(path),
      isDirty: false,
      isLoading: true,
    };
    
    set({
      openFiles: [...openFiles, newFile],
      activeFilePath: path,
    });
    
    // 如果是 Diff 文件，不需要读取内容
    if (path.startsWith('diff://')) {
      set((state) => ({
        openFiles: state.openFiles.map(f =>
          f.path === path
            ? {
                ...f,
                isLoading: false,
                name: f.name + ' (Diff)', // Append Diff to name for clarity
              }
            : f
        ),
      }));
      return;
    }
    
    try {
      // 从后端读取文件内容
      const response = await fsApi.readFile(path);
      
      set((state) => ({
        openFiles: state.openFiles.map(f =>
          f.path === path
            ? {
                ...f,
                content: response.content,
                originalContent: response.content,
                isLoading: false,
              }
            : f
        ),
      }));
    } catch (error) {
      console.error('Failed to read file:', error);
      // 移除加载失败的文件
      set((state) => ({
        openFiles: state.openFiles.filter(f => f.path !== path),
        activeFilePath: state.activeFilePath === path
          ? (state.openFiles[0]?.path || null)
          : state.activeFilePath,
      }));
    }
  },
  
  // 关闭文件
  closeFile: (path) => {
    const { openFiles, activeFilePath } = get();
    const fileIndex = openFiles.findIndex(f => f.path === path);
    
    if (fileIndex === -1) return;
    
    const newOpenFiles = openFiles.filter(f => f.path !== path);
    
    // 如果关闭的是当前活动文件，切换到其他文件
    let newActiveFilePath = activeFilePath;
    if (activeFilePath === path) {
      if (newOpenFiles.length > 0) {
        // 切换到相邻的文件
        const newIndex = Math.min(fileIndex, newOpenFiles.length - 1);
        newActiveFilePath = newOpenFiles[newIndex].path;
      } else {
        newActiveFilePath = null;
      }
    }
    
    set({
      openFiles: newOpenFiles,
      activeFilePath: newActiveFilePath,
    });
  },
  
  // 设置活动文件
  setActiveFile: (path) => {
    set({ activeFilePath: path });
  },
  
  // 更新文件内容
  updateFileContent: (path, content) => {
    set((state) => ({
      openFiles: state.openFiles.map(f =>
        f.path === path
          ? {
              ...f,
              content,
              isDirty: content !== f.originalContent,
            }
          : f
      ),
    }));
  },
  
  // 保存文件
  saveFile: async (path) => {
    const { openFiles } = get();
    const file = openFiles.find(f => f.path === path);
    
    if (!file || !file.isDirty) return;
    
    try {
      await fsApi.writeFile(path, file.content);
      
      set((state) => ({
        openFiles: state.openFiles.map(f =>
          f.path === path
            ? {
                ...f,
                originalContent: f.content,
                isDirty: false,
              }
            : f
        ),
      }));
    } catch (error) {
      console.error('Failed to save file:', error);
      throw error;
    }
  },
  
  // 保存当前活动文件
  saveActiveFile: async () => {
    const { activeFilePath, saveFile } = get();
    if (activeFilePath) {
      await saveFile(activeFilePath);
    }
  },
  
  // 获取当前活动文件
  getActiveFile: () => {
    const { openFiles, activeFilePath } = get();
    return openFiles.find(f => f.path === activeFilePath);
  },
  
  // 检查是否有未保存的更改
  hasUnsavedChanges: () => {
    const { openFiles } = get();
    return openFiles.some(f => f.isDirty);
  },
}));
