'use client';

import {
  useWorkerPool,
  WorkerPoolContextProvider,
  type WorkerInitializationRenderOptions,
  type WorkerPoolOptions,
} from '@pierre/diffs/react';
import { useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { ATMOS_DIFF_THEME } from '@/features/diff/lib/diff-view-constants';
import { installPierreDiffHunksRendererGuard } from '@/features/diff/lib/pierre-diff-hunks-guard';
import { pierreWorkerFactory } from '@/shared/lib/pierre-worker-factory';

installPierreDiffHunksRendererGuard();

function getPoolSize(): number {
  const cores = globalThis.navigator?.hardwareConcurrency ?? 1;
  return Math.min(Math.max(1, cores - 1), 3);
}

const poolOptions: WorkerPoolOptions = {
  poolSize: getPoolSize(),
  totalASTLRUCacheSize: 100,
  workerFactory: pierreWorkerFactory,
};

const highlighterOptions: WorkerInitializationRenderOptions = {
  theme: ATMOS_DIFF_THEME,
  preferredHighlighter: 'shiki-wasm',
  langs: [
    'cpp',
    'css',
    'go',
    'python',
    'rust',
    'sh',
    'swift',
    'tsx',
    'typescript',
    'javascript',
    'json',
    'yaml',
    'markdown',
  ],
};

export function DiffWorkerPoolProvider({ children }: { children: ReactNode }) {
  return (
    <WorkerPoolContextProvider
      poolOptions={poolOptions}
      highlighterOptions={highlighterOptions}
    >
      {children}
    </WorkerPoolContextProvider>
  );
}

/** Gate CodeView mount until the pool is warm (matches diffshub). */
export function useDiffWorkerPoolReady(): boolean {
  const workerPool = useWorkerPool();
  const subscribe = useCallback(
    (onStoreChange: () => void) => workerPool?.subscribeToStatChanges(onStoreChange) ?? (() => {}),
    [workerPool],
  );
  const getSnapshot = useCallback(
    () => workerPool?.isInitialized() ?? true,
    [workerPool],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
