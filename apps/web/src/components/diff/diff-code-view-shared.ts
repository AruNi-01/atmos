'use client';

import type { MutableRefObject } from 'react';
import type {
  CodeViewDiffItem,
  CodeViewItem,
  DiffLineAnnotation,
  FileDiffMetadata,
  SelectedLineRange,
} from '@pierre/diffs';
import type { CodeViewHandle } from '@pierre/diffs/react';

export type CopyAnnotationMeta = {
  kind: 'copy';
  key: string;
  filePath: string;
  range: SelectedLineRange;
};

export function isCopyAnnotation(
  annotation: DiffLineAnnotation<CopyAnnotationMeta>,
): annotation is DiffLineAnnotation<CopyAnnotationMeta> & {
  metadata: CopyAnnotationMeta;
} {
  return annotation.metadata?.kind === 'copy';
}

export function getNextItemVersion<LAnnotation>(
  item: CodeViewItem<LAnnotation>,
): number {
  return typeof item.version === 'number' ? item.version + 1 : 1;
}

export function getTextForRange(
  contents: { oldContent: string; newContent: string },
  range: SelectedLineRange,
): string {
  const side = range.endSide ?? range.side;
  if (!side) return '';
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  const source =
    side === 'deletions' ? contents.oldContent : contents.newContent;
  const lines = source.split('\n');
  return lines.slice(start - 1, end).join('\n');
}

export function updateViewerDiffItem<LAnnotation>(
  viewer: CodeViewHandle<LAnnotation> | null,
  itemId: string,
  mutate: (item: CodeViewDiffItem<LAnnotation>) => boolean,
): boolean {
  if (viewer == null) return false;
  const item = viewer.getItem(itemId);
  if (item == null || item.type !== 'diff') return false;
  if (!mutate(item)) return false;
  item.version = getNextItemVersion(item);
  return viewer.updateItem(item);
}

export function toggleItemCollapsed<LAnnotation>(
  viewerRef: MutableRefObject<CodeViewHandle<LAnnotation> | null>,
  itemId: string,
) {
  const viewer = viewerRef.current;
  const instance = viewer?.getInstance();
  const item = viewer?.getItem(itemId);
  if (viewer == null || instance == null || item == null || item.type !== 'diff') {
    return;
  }

  const itemTop = instance.getTopForItem(itemId);
  item.collapsed = item.collapsed !== true;
  item.version = getNextItemVersion(item);
  if (!viewer.updateItem(item)) return;

  if (itemTop != null && itemTop < instance.getScrollTop()) {
    viewer.scrollTo({ type: 'item', id: item.id, align: 'start' });
  }
}

export function applyCollapseModeToItems<LAnnotation>(
  viewerRef: MutableRefObject<CodeViewHandle<LAnnotation> | null>,
  itemIds: readonly string[],
  mode: 'expanded' | 'collapsed',
) {
  const viewer = viewerRef.current;
  if (viewer == null) return;
  const targetCollapsed = mode === 'collapsed';
  for (const itemId of itemIds) {
    const item = viewer.getItem(itemId);
    if (item == null || item.type !== 'diff') continue;
    if ((item.collapsed === true) === targetCollapsed) continue;
    item.collapsed = targetCollapsed;
    item.version = getNextItemVersion(item);
    viewer.updateItem(item);
  }
}

export function filePathFromHeaderContext(
  fileDiff: FileDiffMetadata,
  pathByName: Map<string, string>,
): string {
  return pathByName.get(fileDiff.name) ?? fileDiff.name;
}
