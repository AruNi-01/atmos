'use client';

import type {
  ChangeContent,
  FileDiffMetadata,
} from '@pierre/diffs';
import type { SelectionInfo } from '@/shared/lib/format-selection-for-ai';

export const DIFF_VIRTUALIZER_SCROLL_CLASS = 'diff-virtualizer-scroll';

export type DiffViewerLineTypeInfo = {
  type: 'context' | 'addition' | 'deletion' | 'mixed';
  oldLine?: number;
  newLine?: number;
};

export type DiffViewerLineTypeMap = {
  oldMap: Map<number, DiffViewerLineTypeInfo>;
  newMap: Map<number, DiffViewerLineTypeInfo>;
};

export function getDiffScrollRoot(
  container: HTMLElement | null,
): HTMLElement | null {
  if (!container) return null;
  const virtualizerRoot = container.querySelector<HTMLElement>(
    `.${DIFF_VIRTUALIZER_SCROLL_CLASS}`,
  );
  if (virtualizerRoot) return virtualizerRoot;

  const shadowRoot = container.querySelector('diffs-container')?.shadowRoot;
  const codePanel = shadowRoot?.querySelector<HTMLElement>('[data-code]');
  return codePanel ?? container;
}

export function buildDiffViewerLineTypeMap(
  diffMeta: FileDiffMetadata | null,
): DiffViewerLineTypeMap {
  const oldMap = new Map<number, DiffViewerLineTypeInfo>();
  const newMap = new Map<number, DiffViewerLineTypeInfo>();
  if (!diffMeta) return { oldMap, newMap };

  for (const hunk of diffMeta.hunks) {
    let oldLine = hunk.deletionStart;
    let newLine = hunk.additionStart;

    for (const content of hunk.hunkContent) {
      if (content.type === 'context') {
        const lineCount = Array.isArray(content.lines)
          ? (content.lines as string[]).length
          : (content.lines as number);
        for (let i = 0; i < lineCount; i++) {
          const info: DiffViewerLineTypeInfo = {
            type: 'context',
            oldLine,
            newLine,
          };
          oldMap.set(oldLine, info);
          newMap.set(newLine, info);
          oldLine++;
          newLine++;
        }
      } else {
        const change = content as ChangeContent;
        const deletionCount = Array.isArray(change.deletions)
          ? change.deletions.length
          : change.deletions;
        const additionCount = Array.isArray(change.additions)
          ? change.additions.length
          : change.additions;
        const hasBoth = deletionCount > 0 && additionCount > 0;
        const lineType = hasBoth
          ? 'mixed'
          : (deletionCount > 0 ? 'deletion' : 'addition');
        const delStart = oldLine;
        const addStart = newLine;
        for (let i = 0; i < deletionCount; i++) {
          oldMap.set(oldLine, { type: lineType, oldLine, newLine: addStart });
          oldLine++;
        }
        for (let i = 0; i < additionCount; i++) {
          newMap.set(newLine, { type: lineType, oldLine: delStart, newLine });
          newLine++;
        }
      }
    }
  }
  return { oldMap, newMap };
}

function getMappedContextRange(
  lineMap: Map<number, DiffViewerLineTypeInfo>,
  startLine: number,
  endLine: number,
) {
  const mapped: DiffViewerLineTypeInfo[] = [];
  for (let line = startLine; line <= endLine; line++) {
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

export function buildDiffViewerSelectionInfo(args: {
  filePath: string;
  oldContent?: string;
  newContent?: string;
  lineTypeMap: DiffViewerLineTypeMap;
  startLine: number;
  endLine: number;
  side: 'deletions' | 'additions';
}): SelectionInfo {
  const normalizedStart = Math.min(args.startLine, args.endLine);
  const normalizedEnd = Math.max(args.startLine, args.endLine);
  const sourceContent =
    args.side === 'deletions' ? args.oldContent : args.newContent;

  let selectedText = '';
  if (sourceContent) {
    const lines = sourceContent.split('\n');
    selectedText = lines.slice(normalizedStart - 1, normalizedEnd).join('\n');
  }

  const oldLines = args.oldContent?.split('\n') || [];
  const newLines = args.newContent?.split('\n') || [];
  const sideMap =
    args.side === 'deletions'
      ? args.lineTypeMap.oldMap
      : args.lineTypeMap.newMap;

  const lineTypes = new Set<string>();
  for (let ln = normalizedStart; ln <= normalizedEnd; ln++) {
    const info = sideMap.get(ln);
    lineTypes.add(info?.type || 'context');
  }

  const hasMixed = lineTypes.has('mixed');
  const hasAddition = lineTypes.has('addition');
  const hasDeletion = lineTypes.has('deletion');
  const hasContext = lineTypes.has('context');
  const onlyContext = lineTypes.size === 1 && hasContext;
  const onlyPureAddition = !hasMixed && !hasDeletion && hasAddition;
  const onlyPureDeletion = !hasMixed && !hasAddition && hasDeletion;

  let changeType: SelectionInfo['changeType'];
  let beforeText: string | undefined;
  let afterText: string | undefined;

  if (onlyContext) {
    changeType = 'context';
    const mapped = getMappedContextRange(sideMap, normalizedStart, normalizedEnd);
    beforeText = oldLines.slice(mapped.oldStart - 1, mapped.oldEnd).join('\n');
    afterText = newLines.slice(mapped.newStart - 1, mapped.newEnd).join('\n');
  } else if (onlyPureAddition) {
    changeType = 'addition';
    beforeText = undefined;
    afterText = newLines.slice(normalizedStart - 1, normalizedEnd).join('\n');
  } else if (onlyPureDeletion) {
    changeType = 'deletion';
    beforeText = oldLines.slice(normalizedStart - 1, normalizedEnd).join('\n');
    afterText = undefined;
  } else {
    changeType = 'mixed';
    let minOtherLine = Infinity;
    let maxOtherLine = -Infinity;
    for (let ln = normalizedStart; ln <= normalizedEnd; ln++) {
      const info = sideMap.get(ln);
      if (info) {
        const otherLine = args.side === 'deletions' ? info.newLine : info.oldLine;
        if (otherLine != null) {
          minOtherLine = Math.min(minOtherLine, otherLine);
          maxOtherLine = Math.max(maxOtherLine, otherLine);
        }
      }
    }
    if (args.side === 'deletions') {
      beforeText = oldLines.slice(normalizedStart - 1, normalizedEnd).join('\n');
      afterText = minOtherLine <= maxOtherLine
        ? newLines.slice(minOtherLine - 1, maxOtherLine).join('\n')
        : undefined;
    } else {
      afterText = newLines.slice(normalizedStart - 1, normalizedEnd).join('\n');
      beforeText = minOtherLine <= maxOtherLine
        ? oldLines.slice(minOtherLine - 1, maxOtherLine).join('\n')
        : undefined;
    }
  }

  return {
    filePath: args.filePath,
    startLine: normalizedStart,
    endLine: normalizedEnd,
    selectedText: selectedText || `Lines ${normalizedStart}-${normalizedEnd}`,
    changeType,
    diffSide: args.side === 'deletions' ? 'old' : 'new',
    beforeText,
    afterText,
  };
}
