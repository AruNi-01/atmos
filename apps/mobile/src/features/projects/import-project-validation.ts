import type { FsValidateGitPathResponse } from "@/api/types";

export type ProjectPathValidation = {
  path: string;
  result: FsValidateGitPathResponse;
};

export function validationMatchesPath(validation: ProjectPathValidation | null | undefined, path: string): boolean {
  return Boolean(validation && normalizePath(validation.path) === normalizePath(path));
}

export function getProjectImportReadiness({
  isConnected,
  isCreating,
  name,
  path,
  validation,
}: {
  isConnected: boolean;
  isCreating: boolean;
  name: string;
  path: string;
  validation: ProjectPathValidation | null | undefined;
}) {
  const trimmedPath = normalizePath(path);
  const trimmedName = name.trim();

  if (!isConnected) {
    return { canImport: false, reason: "Connect to a Computer before importing a project." };
  }

  if (isCreating) {
    return { canImport: false, reason: null };
  }

  if (!trimmedPath) {
    return { canImport: false, reason: "Enter a remote project path." };
  }

  if (!trimmedName) {
    return { canImport: false, reason: "Enter a project name." };
  }

  if (!validationMatchesPath(validation, trimmedPath)) {
    return { canImport: false, reason: "Validate the current remote path before importing." };
  }

  if (!validation?.result.is_valid) {
    return {
      canImport: false,
      reason: validation?.result.error ?? "This path is not a usable project.",
    };
  }

  return { canImport: true, reason: null };
}

function normalizePath(path: string): string {
  return path.trim();
}
