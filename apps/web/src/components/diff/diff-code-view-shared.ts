'use client';

import type { MutableRefObject } from 'react';
import type {
  ChangeContent,
  CodeViewDiffItem,
  CodeViewItem,
  DiffLineAnnotation,
  FileDiffMetadata,
  SelectedLineRange,
} from '@pierre/diffs';
import type { CodeViewHandle } from '@pierre/diffs/react';
import type { SelectionInfo } from '@/lib/format-selection-for-ai';

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

type LineTypeInfo = {
  type: 'context' | 'addition' | 'deletion' | 'mixed';
  oldLine?: number;
  newLine?: number;
};

function buildLineTypeMaps(fileDiff: FileDiffMetadata) {
  const oldMap = new Map<number, LineTypeInfo>();
  const newMap = new Map<number, LineTypeInfo>();

  for (const hunk of fileDiff.hunks) {
    let oldLine = hunk.deletionStart;
    let newLine = hunk.additionStart;

    for (const content of hunk.hunkContent) {
      if (content.type === 'context') {
        const lineCount = Array.isArray(content.lines)
          ? content.lines.length
          : content.lines;

        for (let index = 0; index < lineCount; index += 1) {
          const info: LineTypeInfo = { type: 'context', oldLine, newLine };
          oldMap.set(oldLine, info);
          newMap.set(newLine, info);
          oldLine += 1;
          newLine += 1;
        }
        continue;
      }

      const change = content as ChangeContent;
      const deletionCount = Array.isArray(change.deletions)
        ? change.deletions.length
        : change.deletions;
      const additionCount = Array.isArray(change.additions)
        ? change.additions.length
        : change.additions;
      const hasBoth = deletionCount > 0 && additionCount > 0;
      const lineType: LineTypeInfo['type'] = hasBoth
        ? 'mixed'
        : deletionCount > 0
          ? 'deletion'
          : 'addition';
      const deletionStart = oldLine;
      const additionStart = newLine;

      for (let index = 0; index < deletionCount; index += 1) {
        oldMap.set(oldLine, { type: lineType, oldLine, newLine: additionStart });
        oldLine += 1;
      }

      for (let index = 0; index < additionCount; index += 1) {
        newMap.set(newLine, { type: lineType, oldLine: deletionStart, newLine });
        newLine += 1;
      }
    }
  }

  return { oldMap, newMap };
}

function getMappedContextRange(
  lineMap: Map<number, LineTypeInfo>,
  startLine: number,
  endLine: number,
) {
  const mapped: LineTypeInfo[] = [];
  for (let line = startLine; line <= endLine; line += 1) {
    const info = lineMap.get(line);
    if (info) mapped.push(info);
  }

  return {
    oldStart: mapped[0]?.oldLine ?? startLine,
    oldEnd: mapped[mapped.length - 1]?.oldLine ?? endLine,
    newStart: mapped[0]?.newLine ?? startLine,
    newEnd: mapped[mapped.length - 1]?.newLine ?? endLine,
  };
}

export function formatSelectedRangeLabel(range: SelectedLineRange): string {
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  return start === end ? `Line ${start}` : `Lines ${start}-${end}`;
}

export function buildDiffSelectionInfo(args: {
  filePath: string;
  fileDiff: FileDiffMetadata;
  contents: { oldContent: string; newContent: string };
  range: SelectedLineRange;
}): SelectionInfo | null {
  const side = args.range.endSide ?? args.range.side;
  if (!side) return null;

  const startLine = Math.min(args.range.start, args.range.end);
  const endLine = Math.max(args.range.start, args.range.end);
  const oldLines = args.contents.oldContent.split('\n');
  const newLines = args.contents.newContent.split('\n');
  const sourceLines = side === 'deletions' ? oldLines : newLines;
  const selectedText = sourceLines.slice(startLine - 1, endLine).join('\n');
  const { oldMap, newMap } = buildLineTypeMaps(args.fileDiff);
  const lineMap = side === 'deletions' ? oldMap : newMap;
  const lineTypes = new Set<LineTypeInfo['type']>();

  for (let line = startLine; line <= endLine; line += 1) {
    lineTypes.add(lineMap.get(line)?.type ?? 'context');
  }

  const hasMixed = lineTypes.has('mixed');
  const hasAddition = lineTypes.has('addition');
  const hasDeletion = lineTypes.has('deletion');
  const hasContext = lineTypes.has('context');
  const onlyContext = lineTypes.size === 1 && hasContext;
  const onlyAddition = !hasMixed && !hasDeletion && hasAddition;
  const onlyDeletion = !hasMixed && !hasAddition && hasDeletion;

  let changeType: SelectionInfo['changeType'];
  let beforeText: string | undefined;
  let afterText: string | undefined;

  if (onlyContext) {
    changeType = 'context';
    const mapped = getMappedContextRange(lineMap, startLine, endLine);
    beforeText = oldLines.slice(mapped.oldStart - 1, mapped.oldEnd).join('\n');
    afterText = newLines.slice(mapped.newStart - 1, mapped.newEnd).join('\n');
  } else if (onlyAddition) {
    changeType = 'addition';
    afterText = newLines.slice(startLine - 1, endLine).join('\n');
  } else if (onlyDeletion) {
    changeType = 'deletion';
    beforeText = oldLines.slice(startLine - 1, endLine).join('\n');
  } else {
    changeType = 'mixed';
    let minOtherLine = Infinity;
    let maxOtherLine = -Infinity;

    for (let line = startLine; line <= endLine; line += 1) {
      const info = lineMap.get(line);
      if (!info) continue;
      const otherLine = side === 'deletions' ? info.newLine : info.oldLine;
      if (otherLine == null) continue;
      minOtherLine = Math.min(minOtherLine, otherLine);
      maxOtherLine = Math.max(maxOtherLine, otherLine);
    }

    if (side === 'deletions') {
      beforeText = oldLines.slice(startLine - 1, endLine).join('\n');
      afterText =
        minOtherLine <= maxOtherLine
          ? newLines.slice(minOtherLine - 1, maxOtherLine).join('\n')
          : undefined;
    } else {
      afterText = newLines.slice(startLine - 1, endLine).join('\n');
      beforeText =
        minOtherLine <= maxOtherLine
          ? oldLines.slice(minOtherLine - 1, maxOtherLine).join('\n')
          : undefined;
    }
  }

  return {
    filePath: args.filePath,
    startLine,
    endLine,
    selectedText:
      selectedText || `Lines ${startLine}${startLine === endLine ? '' : `-${endLine}`}`,
    changeType,
    diffSide: side === 'deletions' ? 'old' : 'new',
    beforeText,
    afterText,
  };
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
