export function canSaveWorkspaceNote(
  currentContent: string | null | undefined,
  expectedContent?: string,
): boolean {
  return expectedContent === undefined || (currentContent ?? '') === expectedContent;
}
