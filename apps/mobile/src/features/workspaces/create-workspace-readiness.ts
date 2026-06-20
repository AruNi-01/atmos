export type ProjectOption = {
  label: string;
  value: string;
};

export function selectCreateWorkspaceProjectGuid({
  currentProjectGuid,
  initialProjectGuid,
  projectOptions,
}: {
  currentProjectGuid: string;
  initialProjectGuid?: string | null;
  projectOptions: ProjectOption[];
}) {
  if (currentProjectGuid && projectOptions.some((project) => project.value === currentProjectGuid)) {
    return currentProjectGuid;
  }

  if (initialProjectGuid && projectOptions.some((project) => project.value === initialProjectGuid)) {
    return initialProjectGuid;
  }

  return projectOptions[0]?.value ?? "";
}

export function getCreateWorkspaceReadiness({
  isAwaitingSetup,
  isConnected,
  isCreating,
  projectGuid,
  title,
}: {
  isAwaitingSetup: boolean;
  isConnected: boolean;
  isCreating: boolean;
  projectGuid: string;
  title: string;
}) {
  if (!isConnected) {
    return { canCreate: false, reason: "Connect to a Computer before creating a workspace." };
  }

  if (isCreating || isAwaitingSetup) {
    return { canCreate: false, reason: null };
  }

  if (!projectGuid) {
    return { canCreate: false, reason: "Select a project for this workspace." };
  }

  if (!title.trim()) {
    return { canCreate: false, reason: "Enter a workspace title." };
  }

  return { canCreate: true, reason: null };
}
