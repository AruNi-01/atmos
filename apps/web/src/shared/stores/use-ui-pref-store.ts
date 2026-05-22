'use client';

import { create } from 'zustand';
import { instKey, readJson, writeJson } from '@/shared/lib/browser-store';
import type { ConnectionInstanceId } from '@/features/connection/lib/connection-instance';

export type UiPrefSlice =
  | 'agent'
  | 'review'
  | 'codeReview'
  | 'editor'
  | 'centerStage'
  | 'runPreview'
  | 'canvas'
  | 'sidebar'
  | 'usage'
  | 'connection';

type SliceMap = Partial<Record<UiPrefSlice, unknown>>;

interface UiPrefStoreState {
  byInstance: Record<string, SliceMap>;
  readSlice: <T>(instanceId: ConnectionInstanceId, slice: UiPrefSlice, fallback: T) => T;
  writeSlice: <T>(
    instanceId: ConnectionInstanceId,
    slice: UiPrefSlice,
    value: T,
  ) => void;
  patchSlice: <T>(
    instanceId: ConnectionInstanceId,
    slice: UiPrefSlice,
    updater: T | ((prev: T) => T),
    fallback: T,
  ) => T;
  clearInstanceCache: (instanceId: ConnectionInstanceId) => void;
}

export const useUiPrefStore = create<UiPrefStoreState>((set, get) => ({
  byInstance: {},

  readSlice: (instanceId, slice, fallback) => {
    const cached = get().byInstance[instanceId]?.[slice];
    if (cached !== undefined) {
      return cached as typeof fallback;
    }
    const fromDisk = readJson(instKey(instanceId, slice), fallback);
    set(state => ({
      byInstance: {
        ...state.byInstance,
        [instanceId]: {
          ...state.byInstance[instanceId],
          [slice]: fromDisk,
        },
      },
    }));
    return fromDisk;
  },

  writeSlice: (instanceId, slice, value) => {
    set(state => ({
      byInstance: {
        ...state.byInstance,
        [instanceId]: {
          ...state.byInstance[instanceId],
          [slice]: value,
        },
      },
    }));
    writeJson(instKey(instanceId, slice), value);
  },

  patchSlice: (instanceId, slice, updater, fallback) => {
    const prev = get().readSlice(instanceId, slice, fallback);
    const next =
      typeof updater === 'function'
        ? (updater as (p: typeof fallback) => typeof fallback)(prev)
        : updater;
    get().writeSlice(instanceId, slice, next);
    return next;
  },

  clearInstanceCache: instanceId => {
    set(state => {
      const next = { ...state.byInstance };
      delete next[instanceId];
      return { byInstance: next };
    });
  },
}));
