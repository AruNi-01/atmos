'use client';

import { create } from 'zustand';
import { fsApi } from '@/api/ws-api';

// ===== 类型定义 =====

export type TaskStatus = 'todo' | 'progress' | 'done' | 'cancelled';

export interface Task {
  content: string;
  status: TaskStatus;
  rawLine: string;
}

interface WorkspaceContextState {
  requirement: string | null;
  tasks: Task[];
}

interface WorkspaceContextStore {
  // 状态（按 workspaceId 存储）
  workspaceStates: Record<string, WorkspaceContextState>;
  
  // Loading 状态
  requirementLoading: boolean;
  tasksLoading: boolean;

  // Requirement 相关
  loadRequirement: (workspaceId: string, projectPath: string) => Promise<void>;
  saveRequirement: (workspaceId: string, projectPath: string, content: string) => Promise<void>;

  // Task 相关
  loadTasks: (workspaceId: string, projectPath: string) => Promise<void>;
  addTask: (workspaceId: string, projectPath: string, content: string) => Promise<void>;
  updateTaskStatus: (workspaceId: string, projectPath: string, taskIndex: number, status: TaskStatus) => Promise<void>;
  updateTaskContent: (workspaceId: string, projectPath: string, taskIndex: number, content: string) => Promise<void>;
  deleteTask: (workspaceId: string, projectPath: string, taskIndex: number) => Promise<void>;

  // 辅助方法
  getRequirement: (workspaceId: string) => string | null;
  getTasks: (workspaceId: string) => Task[];
}

// ===== Task 解析工具函数 =====

const TASK_PATTERN = /^-\s*\[([ x\/\-])\]\s*(.*)$/;

function parseTaskStatus(marker: string): TaskStatus {
  switch (marker) {
    case 'x':
      return 'done';
    case '/':
      return 'progress';
    case '-':
      return 'cancelled';
    default:
      return 'todo';
  }
}

function statusToMarker(status: TaskStatus): string {
  switch (status) {
    case 'done':
      return 'x';
    case 'progress':
      return '/';
    case 'cancelled':
      return '-';
    default:
      return ' ';
  }
}

function parseTaskLine(line: string): Task | null {
  const match = line.match(TASK_PATTERN);
  if (!match) return null;
  
  const [, marker, content] = match;
  return {
    content: content.trim(),
    status: parseTaskStatus(marker),
    rawLine: line,
  };
}

function parseTasks(content: string): Task[] {
  const lines = content.split('\n');
  const tasks: Task[] = [];
  
  for (const line of lines) {
    const task = parseTaskLine(line);
    if (task) {
      tasks.push(task);
    }
  }
  
  return tasks;
}

function taskToLine(task: Task): string {
  return `- [${statusToMarker(task.status)}] ${task.content}`;
}

function tasksToContent(tasks: Task[]): string {
  return tasks.map(taskToLine).join('\n');
}

function getRequirementPath(projectPath: string): string {
  return `${projectPath}/.atmos/context/requirement.md`;
}

function getTaskPath(projectPath: string): string {
  return `${projectPath}/.atmos/context/task.md`;
}

// ===== Store 实现 =====

export const useWorkspaceContextStore = create<WorkspaceContextStore>()((set, get) => ({
  workspaceStates: {},
  requirementLoading: false,
  tasksLoading: false,

  getRequirement: (workspaceId: string) => {
    return get().workspaceStates[workspaceId]?.requirement ?? null;
  },

  getTasks: (workspaceId: string) => {
    return get().workspaceStates[workspaceId]?.tasks ?? [];
  },

  loadRequirement: async (workspaceId: string, projectPath: string) => {
    set({ requirementLoading: true });
    
    const filePath = getRequirementPath(projectPath);
    const response = await fsApi.readFile(filePath);
    
    set((state) => ({
      requirementLoading: false,
      workspaceStates: {
        ...state.workspaceStates,
        [workspaceId]: {
          ...state.workspaceStates[workspaceId],
          requirement: response.exists ? response.content : null,
          tasks: state.workspaceStates[workspaceId]?.tasks ?? [],
        },
      },
    }));
  },

  saveRequirement: async (workspaceId: string, projectPath: string, content: string) => {
    const filePath = getRequirementPath(projectPath);
    await fsApi.writeFile(filePath, content);
    
    set((state) => ({
      workspaceStates: {
        ...state.workspaceStates,
        [workspaceId]: {
          ...state.workspaceStates[workspaceId],
          requirement: content,
          tasks: state.workspaceStates[workspaceId]?.tasks ?? [],
        },
      },
    }));
  },

  loadTasks: async (workspaceId: string, projectPath: string) => {
    set({ tasksLoading: true });
    
    const filePath = getTaskPath(projectPath);
    const response = await fsApi.readFile(filePath);
    const tasks = response.exists && response.content ? parseTasks(response.content) : [];
    
    set((state) => ({
      tasksLoading: false,
      workspaceStates: {
        ...state.workspaceStates,
        [workspaceId]: {
          requirement: state.workspaceStates[workspaceId]?.requirement ?? null,
          tasks,
        },
      },
    }));
  },

  addTask: async (workspaceId: string, projectPath: string, content: string) => {
    const currentTasks = get().getTasks(workspaceId);
    const newTask: Task = {
      content,
      status: 'todo',
      rawLine: `- [ ] ${content}`,
    };
    const updatedTasks = [...currentTasks, newTask];
    
    const filePath = getTaskPath(projectPath);
    await fsApi.writeFile(filePath, tasksToContent(updatedTasks));
    
    set((state) => ({
      workspaceStates: {
        ...state.workspaceStates,
        [workspaceId]: {
          requirement: state.workspaceStates[workspaceId]?.requirement ?? null,
          tasks: updatedTasks,
        },
      },
    }));
  },

  updateTaskStatus: async (workspaceId: string, projectPath: string, taskIndex: number, status: TaskStatus) => {
    const currentTasks = get().getTasks(workspaceId);
    if (taskIndex < 0 || taskIndex >= currentTasks.length) return;
    
    const updatedTasks = currentTasks.map((task, index) => {
      if (index === taskIndex) {
        const updatedTask: Task = {
          ...task,
          status,
          rawLine: taskToLine({ ...task, status }),
        };
        return updatedTask;
      }
      return task;
    });
    
    const filePath = getTaskPath(projectPath);
    await fsApi.writeFile(filePath, tasksToContent(updatedTasks));
    
    set((state) => ({
      workspaceStates: {
        ...state.workspaceStates,
        [workspaceId]: {
          requirement: state.workspaceStates[workspaceId]?.requirement ?? null,
          tasks: updatedTasks,
        },
      },
    }));
  },

  updateTaskContent: async (workspaceId: string, projectPath: string, taskIndex: number, content: string) => {
    const currentTasks = get().getTasks(workspaceId);
    if (taskIndex < 0 || taskIndex >= currentTasks.length) return;
    
    const updatedTasks = currentTasks.map((task, index) => {
      if (index === taskIndex) {
        const updatedTask: Task = {
          ...task,
          content,
          rawLine: taskToLine({ ...task, content }),
        };
        return updatedTask;
      }
      return task;
    });
    
    const filePath = getTaskPath(projectPath);
    await fsApi.writeFile(filePath, tasksToContent(updatedTasks));
    
    set((state) => ({
      workspaceStates: {
        ...state.workspaceStates,
        [workspaceId]: {
          requirement: state.workspaceStates[workspaceId]?.requirement ?? null,
          tasks: updatedTasks,
        },
      },
    }));
  },

  deleteTask: async (workspaceId: string, projectPath: string, taskIndex: number) => {
    const currentTasks = get().getTasks(workspaceId);
    if (taskIndex < 0 || taskIndex >= currentTasks.length) return;
    
    const updatedTasks = currentTasks.filter((_, index) => index !== taskIndex);
    
    const filePath = getTaskPath(projectPath);
    await fsApi.writeFile(filePath, tasksToContent(updatedTasks));
    
    set((state) => ({
      workspaceStates: {
        ...state.workspaceStates,
        [workspaceId]: {
          requirement: state.workspaceStates[workspaceId]?.requirement ?? null,
          tasks: updatedTasks,
        },
      },
    }));
  },
}));

// ===== 便捷 Hook =====

export function useWorkspaceContext(workspaceId: string | null) {
  const store = useWorkspaceContextStore();
  
  return {
    requirement: workspaceId ? store.getRequirement(workspaceId) : null,
    requirementLoading: store.requirementLoading,
    tasks: workspaceId ? store.getTasks(workspaceId) : [],
    tasksLoading: store.tasksLoading,
    
    loadRequirement: (projectPath: string) => 
      workspaceId ? store.loadRequirement(workspaceId, projectPath) : Promise.resolve(),
    saveRequirement: (projectPath: string, content: string) => 
      workspaceId ? store.saveRequirement(workspaceId, projectPath, content) : Promise.resolve(),
    
    loadTasks: (projectPath: string) => 
      workspaceId ? store.loadTasks(workspaceId, projectPath) : Promise.resolve(),
    addTask: (projectPath: string, content: string) => 
      workspaceId ? store.addTask(workspaceId, projectPath, content) : Promise.resolve(),
    updateTaskStatus: (projectPath: string, taskIndex: number, status: TaskStatus) => 
      workspaceId ? store.updateTaskStatus(workspaceId, projectPath, taskIndex, status) : Promise.resolve(),
    updateTaskContent: (projectPath: string, taskIndex: number, content: string) => 
      workspaceId ? store.updateTaskContent(workspaceId, projectPath, taskIndex, content) : Promise.resolve(),
    deleteTask: (projectPath: string, taskIndex: number) => 
      workspaceId ? store.deleteTask(workspaceId, projectPath, taskIndex) : Promise.resolve(),
  };
}
