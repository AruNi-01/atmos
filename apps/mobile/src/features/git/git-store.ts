import { create } from "zustand";
import type { GitChangedFile, GitFileDiffResponse, GitStatusResponse } from "@/api/types";

type GitState = {
  repoPath: string | null;
  status: GitStatusResponse | null;
  stagedFiles: GitChangedFile[];
  unstagedFiles: GitChangedFile[];
  untrackedFiles: GitChangedFile[];
  selectedFilePath: string | null;
  diffResponseByPath: Record<string, GitFileDiffResponse>;
  commitMessage: string;
  commitResultMessage: string | null;
  setRepoPath: (repoPath: string | null) => void;
  setStatus: (status: GitStatusResponse | null) => void;
  setChangedFiles: (files: {
    stagedFiles: GitChangedFile[];
    unstagedFiles: GitChangedFile[];
    untrackedFiles: GitChangedFile[];
  }) => void;
  selectFile: (path: string | null) => void;
  setDiff: (diff: GitFileDiffResponse) => void;
  setCommitMessage: (message: string) => void;
  setCommitResultMessage: (message: string | null) => void;
  reset: () => void;
};

const initialGitState = {
  repoPath: null,
  status: null,
  stagedFiles: [],
  unstagedFiles: [],
  untrackedFiles: [],
  selectedFilePath: null,
  diffResponseByPath: {},
  commitMessage: "",
  commitResultMessage: null,
};

export const useGitStore = create<GitState>((set) => ({
  ...initialGitState,
  setRepoPath: (repoPath) => set({ repoPath }),
  setStatus: (status) => set({ status }),
  setChangedFiles: ({ stagedFiles, unstagedFiles, untrackedFiles }) =>
    set({
      stagedFiles,
      unstagedFiles,
      untrackedFiles,
    }),
  selectFile: (selectedFilePath) => set({ selectedFilePath }),
  setDiff: (diff) =>
    set((state) => ({
      diffResponseByPath: {
        ...state.diffResponseByPath,
        [diff.file_path]: diff,
      },
    })),
  setCommitMessage: (commitMessage) => set({ commitMessage }),
  setCommitResultMessage: (commitResultMessage) => set({ commitResultMessage }),
  reset: () => set(initialGitState),
}));
