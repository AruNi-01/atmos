'use client';

import { DEFAULT_THEMES } from '@pierre/diffs';
import {
  useWorkerPool,
  WorkerPoolContextProvider,
  type WorkerInitializationRenderOptions,
  type WorkerPoolOptions,
} from '@pierre/diffs/react';
import { useEffect, useState, type ReactNode } from 'react';
import { pierreWorkerFactory } from '@/shared/lib/pierre-worker-factory';

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
  theme: DEFAULT_THEMES,
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
  const [isReady, setIsReady] = useState(() => workerPool?.isInitialized() ?? true);

  useEffect(() => {
    if (workerPool == null) {
      setIsReady(true);
      return;
    }
    return workerPool.subscribeToStatChanges((stats) => {
      setIsReady(stats.managerState === 'initialized');
    });
  }, [workerPool]);

  return isReady;
}
