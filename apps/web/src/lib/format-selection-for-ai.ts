/**
 * Format selection info for AI Agent consumption
 */

export interface SelectionInfo {
  filePath: string;
  startLine: number;
  endLine: number;
  selectedText: string;
  language?: string;
  // DiffViewer specific
  changeType?: 'addition' | 'deletion' | 'context' | 'mixed';
  beforeText?: string; // Old file content for the selected lines
  afterText?: string;  // New file content for the selected lines
}

function formatLineRange(start: number, end: number): string {
  return start === end ? `L${start}` : `L${start}-L${end}`;
}

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    css: 'css',
    scss: 'scss',
    html: 'html',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
  };
  return langMap[ext || ''] || ext || 'text';
}

/**
 * Format Monaco Editor selection for AI
 */
export function formatEditorSelectionForAI(
  info: SelectionInfo,
  userNote?: string
): string {
  const language = info.language || getLanguageFromPath(info.filePath);

  let output = `## Code Snippet\n`;
  output += `- **File**: \`${info.filePath}\`\n`;
  if (info.startLine > 0) {
    const lineRange = formatLineRange(info.startLine, info.endLine);
    output += `- **Lines**: ${lineRange}\n`;
  }
  output += `\n\`\`\`${language}\n${info.selectedText}\n\`\`\``;

  if (userNote?.trim()) {
    output += `\n\n## Note\n${userNote.trim()}`;
  }

  return output;
}

/**
 * Format DiffViewer selection for AI
 */
export function formatDiffSelectionForAI(
  info: SelectionInfo,
  userNote?: string
): string {
  const lineRange = formatLineRange(info.startLine, info.endLine);
  const language = info.language || getLanguageFromPath(info.filePath);

  let output = `## Code Change\n`;
  output += `- **File**: \`${info.filePath}\`\n`;
  output += `- **Lines**: ${lineRange}\n`;

  if (info.changeType) {
    const changeTypeLabels: Record<string, string> = {
      addition: 'Addition',
      deletion: 'Deletion',
      context: 'Context',
      mixed: 'Mixed',
    };
    output += `- **Change Type**: ${changeTypeLabels[info.changeType] || info.changeType}\n`;
  }

  output += '\n';

  const hasBefore = info.beforeText != null;
  const hasAfter = info.afterText != null;

  if (hasBefore && hasAfter) {
    output += `### Change Before\n`;
    output += `\`\`\`${language}\n${info.beforeText}\n\`\`\`\n\n`;
    output += `### Change After\n`;
    output += `\`\`\`${language}\n${info.afterText}\n\`\`\``;
  } else if (hasBefore && !hasAfter) {
    output += `### Deleted\n`;
    output += `\`\`\`${language}\n${info.beforeText}\n\`\`\``;
  } else if (!hasBefore && hasAfter) {
    output += `### Added\n`;
    output += `\`\`\`${language}\n${info.afterText}\n\`\`\``;
  } else {
    output += `\`\`\`${language}\n${info.selectedText}\n\`\`\``;
  }

  if (userNote?.trim()) {
    output += `\n\n## Note\n${userNote.trim()}`;
  }

  return output;
}
