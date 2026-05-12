import { unifiedMergeView } from '@codemirror/merge';
import type { Extension } from '@codemirror/state';

/**
 * CodeMirror 6 unified diff：将当前文档与 Git 基准版本（如 HEAD）对比。
 * 与后端 `git_file_diff` 返回的 `old_content` 对齐。
 */
export function createGitUnifiedMergeExtensions(original: string): Extension[] {
  return [
    unifiedMergeView({
      original,
      highlightChanges: true,
      gutter: true,
      mergeControls: false,
      allowInlineDiffs: true,
      diffConfig: { scanLimit: 3000, timeout: 400 },
    }),
  ];
}
