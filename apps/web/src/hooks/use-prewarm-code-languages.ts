'use client';

import { useEffect } from 'react';
import { fsApi, type FileTreeNode } from '@/api/ws-api';
import {
  detectCodeLanguage,
  markProjectLanguagesPrewarmed,
  normalizeCodeLanguage,
  preloadCodeLanguages,
} from '@/lib/code-language';
import { useEditorStore, type OpenFile } from '@/hooks/use-editor-store';

const MAX_PREWARM_LANGUAGES = 8;
const MIN_LANGUAGE_FILE_COUNT = 2;
const MAX_RECENT_LANGUAGES = 6;

function collectLanguageCounts(nodes: FileTreeNode[], counts: Map<string, number>) {
  for (const node of nodes) {
    if (node.is_dir) {
      if (node.children) {
        collectLanguageCounts(node.children, counts);
      }
      continue;
    }

    const language = detectCodeLanguage(node.path);
    if (language === 'plaintext') continue;

    counts.set(language, (counts.get(language) || 0) + 1);
  }
}

function getRecentWorkspaceLanguages(
  openFiles: OpenFile[],
  activeFilePath: string | null
): string[] {
  const prioritizedFiles = [...openFiles].sort((left, right) => {
    if (left.path === activeFilePath) return -1;
    if (right.path === activeFilePath) return 1;

    const leftRecency = Math.max(left.lastFocusedAt ?? 0, left.lastOpenedAt ?? 0);
    const rightRecency = Math.max(right.lastFocusedAt ?? 0, right.lastOpenedAt ?? 0);

    if (rightRecency !== leftRecency) {
      return rightRecency - leftRecency;
    }

    return (right.lastFocusedAt ?? 0) - (left.lastFocusedAt ?? 0);
  });

  const recentLanguages: string[] = [];
  const seen = new Set<string>();

  for (const file of prioritizedFiles) {
    const language = normalizeCodeLanguage(file.language || detectCodeLanguage(file.path));
    if (language === 'plaintext' || seen.has(language)) continue;

    seen.add(language);
    recentLanguages.push(language);

    if (recentLanguages.length >= MAX_RECENT_LANGUAGES) {
      break;
    }
  }

  return recentLanguages;
}

export function usePrewarmCodeLanguages() {
  const currentProjectPath = useEditorStore((state) => state.currentProjectPath);
  const currentWorkspaceId = useEditorStore((state) => state.currentWorkspaceId);
  const currentWorkspace = useEditorStore((state) =>
    currentWorkspaceId ? state.workspaceStates[currentWorkspaceId] : undefined
  );

  useEffect(() => {
    const recentLanguages = getRecentWorkspaceLanguages(
      currentWorkspace?.openFiles || [],
      currentWorkspace?.activeFilePath || null
    );

    if (recentLanguages.length === 0) return;
    void preloadCodeLanguages(recentLanguages);
  }, [currentWorkspace?.activeFilePath, currentWorkspace?.openFiles]);

  useEffect(() => {
    if (!currentProjectPath) return;
    if (!markProjectLanguagesPrewarmed(currentProjectPath)) return;

    let cancelled = false;

    void fsApi
      .listProjectFiles(currentProjectPath, { showHidden: false })
      .then(async (response) => {
        if (cancelled) return;

        const counts = new Map<string, number>();
        collectLanguageCounts(response.tree, counts);

        const recentLanguages = getRecentWorkspaceLanguages(
          currentWorkspace?.openFiles || [],
          currentWorkspace?.activeFilePath || null
        );

        const projectLanguages = [...counts.entries()]
          .filter(([, count]) => count >= MIN_LANGUAGE_FILE_COUNT)
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_PREWARM_LANGUAGES)
          .map(([language]) => language);

        const languages = [...new Set([...recentLanguages, ...projectLanguages])];
        if (languages.length === 0) return;
        await preloadCodeLanguages(languages);
      })
      .catch(() => {
        // Best-effort optimization only; ignore scan failures.
      });

    return () => {
      cancelled = true;
    };
  }, [currentProjectPath, currentWorkspace?.activeFilePath, currentWorkspace?.openFiles]);
}
