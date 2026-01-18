import {
  ApiResponse,
  CreateProjectRequest,
  ProjectResponse,
  UpdateProjectRequest,
  ReorderProjectsRequest,
  CreateWorkspaceRequest,
  WorkspaceResponse,
  ReorderWorkspacesRequest,
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    const data = await response.json();
    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Project API
export const projectApi = {
  // Get all projects
  list: () => fetchApi<ProjectResponse[]>('/api/project'),

  // Get single project
  get: (id: string) => fetchApi<ProjectResponse>(`/api/project/${id}`),

  // Create project
  create: (data: CreateProjectRequest) =>
    fetchApi<ProjectResponse>('/api/project', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update project
  update: (data: UpdateProjectRequest) =>
    fetchApi<ProjectResponse>(`/api/project/${data.id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Delete project
  delete: (id: string) =>
    fetchApi<void>(`/api/project/${id}`, {
      method: 'DELETE',
    }),

  // Close project (soft close)
  close: (id: string) =>
    fetchApi<void>(`/api/project/${id}/close`, {
      method: 'POST',
    }),

  // Reorder projects
  reorder: (data: ReorderProjectsRequest) =>
    fetchApi<void>('/api/project/reorder', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Validate git project
  validateGitPath: (path: string) =>
    fetchApi<{ isValid: boolean; name: string }>('/api/project/validate-git', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
};

// Workspace API
export const workspaceApi = {
  // Get all workspaces for a project
  listByProject: (projectId: string) =>
    fetchApi<WorkspaceResponse[]>(`/api/project/${projectId}/workspace`),

  // Create workspace
  create: (data: CreateWorkspaceRequest) =>
    fetchApi<WorkspaceResponse>(`/api/project/${data.projectId}/workspace`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Delete workspace
  delete: (projectId: string, id: string) =>
    fetchApi<void>(`/api/project/${projectId}/workspace/${id}`, {
      method: 'DELETE',
    }),

  // Reorder workspaces
  reorder: (projectId: string, data: ReorderWorkspacesRequest) =>
    fetchApi<void>(`/api/project/${projectId}/workspace/reorder`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Set active workspace
  setActive: (projectId: string, id: string) =>
    fetchApi<void>(`/api/project/${projectId}/workspace/${id}/activate`, {
      method: 'POST',
    }),
};
