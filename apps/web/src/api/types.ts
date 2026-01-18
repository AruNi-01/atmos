// Project API types

export interface CreateProjectRequest {
  name: string;
  mainFilePath: string;
  sidebarOrder?: number;
  borderColor?: string;
}

export interface UpdateProjectRequest {
  id: string;
  name?: string;
  sidebarOrder?: number;
  borderColor?: string;
}

export interface ProjectResponse {
  id: string;
  name: string;
  mainFilePath: string;
  sidebarOrder: number;
  borderColor?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ReorderProjectsRequest {
  projectOrders: { id: string; sidebarOrder: number }[];
}

// Workspace API types
export interface CreateWorkspaceRequest {
  projectId: string;
  name: string;
  branch?: string;
}

export interface WorkspaceResponse {
  id: string;
  projectId: string;
  name: string;
  branch: string;
  isActive: boolean;
  status: 'clean' | 'modified';
}

export interface ReorderWorkspacesRequest {
  workspaceOrders: { id: string; order: number }[];
}
