import type {
  GitChangedFile,
  GitChangedFilesResponse,
} from "@/api/ws-api-types";

interface CompareChangedFilesSelection {
  files: GitChangedFile[];
  compareRef: string | null;
}

/**
 * Compare-mode responses put every compared path into staged/unstaged/untracked
 * buckets. Consumers must concatenate when `compare_ref` is present.
 */
export const EMPTY_CHANGED_FILES: GitChangedFile[] = [];

const EMPTY_COMPARE_SELECTION: CompareChangedFilesSelection = {
  files: EMPTY_CHANGED_FILES,
  compareRef: null,
};
const compareSelectionCache = new WeakMap<
  GitChangedFilesResponse,
  CompareChangedFilesSelection
>();

export function selectCompareChangedFiles(
  response: GitChangedFilesResponse | undefined | null,
): CompareChangedFilesSelection {
  if (!response?.compare_ref) {
    return EMPTY_COMPARE_SELECTION;
  }

  const cachedSelection = compareSelectionCache.get(response);
  if (cachedSelection) {
    return cachedSelection;
  }

  const selection = {
    files: [
      ...response.staged_files,
      ...response.unstaged_files,
      ...response.untracked_files,
    ],
    compareRef: response.compare_ref,
  };
  compareSelectionCache.set(response, selection);
  return selection;
}
