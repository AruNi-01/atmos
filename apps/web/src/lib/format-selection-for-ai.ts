/**
 * Format selection info for AI Agent consumption
 */

import { detectCodeLanguage } from '@/lib/code-language';

export interface SelectionInfo {
  filePath: string;
  startLine: number;
  endLine: number;
  selectedText: string;
  language?: string;
  sourceType?: 'text' | 'element';
  pageUrl?: string;
  selector?: string;
  tagName?: string;
  attributesSummary?: string;
  textPreview?: string;
  htmlPreview?: string;
  framework?: string;
  componentName?: string;
  componentFilePath?: string;
  componentLine?: number;
  componentColumn?: number;
  componentChain?: string[];
  sourceConfidence?: 'high' | 'medium' | 'low';
  sourceDebugSignals?: string[];
  transportMode?: 'same-origin' | 'extension' | 'desktop-native';
  // Wiki-specific
  sectionTitle?: string;
  pageTitle?: string;
  // DiffViewer specific
  changeType?: 'addition' | 'deletion' | 'context' | 'mixed';
  diffSide?: 'old' | 'new';
  beforeText?: string; // Old file content for the selected lines
  afterText?: string;  // New file content for the selected lines
}

function formatLineRange(start: number, end: number): string {
  return start === end ? `L${start}` : `L${start}-L${end}`;
}

function getLanguageFromPath(filePath: string): string {
  return detectCodeLanguage(filePath);
}

function truncateText(value: string | undefined, limit: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

/**
 * Format editor selection for AI
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

/**
 * Format Wiki selection for AI
 */
export function formatWikiSelectionForAI(
  info: SelectionInfo,
  userNote?: string
): string {
  const pageRelativePath = info.filePath
    .replace(/^\.?\/?\.atmos\/wiki\//, '')
    .replace(/^\/+/, '');
  const wikiRoot = '.atmos/wiki';
  const wikiPagePath = `${wikiRoot}/${pageRelativePath || info.filePath}`.replace(/\/{2,}/g, '/');
  const selectedText = info.selectedText.trim();

  let output = `## Wiki Excerpt\n`;
  output += `- **Wiki Root**: \`${wikiRoot}/\`\n`;
  output += `- **Wiki Page**: \`${wikiPagePath}\`\n`;
  if (info.sectionTitle?.trim()) {
    output += `- **Section**: \`${info.sectionTitle.trim()}\`\n`;
  }

  output += `\n~~~markdown\n${selectedText}\n~~~`;
  output += `\n\n## Locate Rule\nIf the wiki page is not found directly, list files under \`${wikiRoot}/\` and locate the closest matching page before answering.`;

  if (userNote?.trim()) {
    output += `\n\n## Ask\n${userNote.trim()}`;
  }

  return output;
}

/**
 * Format Preview element selection for AI
 */
export function formatPreviewSelectionForAI(
  info: SelectionInfo,
  userNote?: string
): string {
  const textPreview = truncateText(info.textPreview || info.selectedText, 280);
  const htmlPreview = truncateText(info.htmlPreview, 2000);
  const componentChain = info.componentChain?.filter(Boolean) ?? [];
  const sourceDebugSignals = info.sourceDebugSignals?.filter(Boolean) ?? [];
  const sourceParts = [
    info.componentFilePath,
    info.componentLine != null ? String(info.componentLine) : null,
    info.componentColumn != null ? String(info.componentColumn) : null,
  ].filter(Boolean);

  let output = `## Preview Element\n`;
  output += `- **Page**: \`${info.pageUrl || info.filePath}\`\n`;
  if (info.selector) {
    output += `- **Selector**: \`${info.selector}\`\n`;
  }
  if (info.tagName) {
    output += `- **Tag**: \`${info.tagName}\`\n`;
  }
  if (info.attributesSummary) {
    output += `- **Attributes**: ${info.attributesSummary}\n`;
  }
  if (info.framework) {
    output += `- **Framework**: ${info.framework}\n`;
  }
  if (info.transportMode) {
    output += `- **Source Mode**: ${info.transportMode}\n`;
  }
  if (info.componentName) {
    output += `- **Source Component**: \`${info.componentName}\`\n`;
  }
  if (componentChain.length > 1) {
    output += `- **Source Component Chain**: ${componentChain.join(' -> ')}\n`;
  }
  if (sourceParts.length > 0) {
    output += `- **Source**: \`${sourceParts.join(':')}\`\n`;
  }
  if (info.sourceConfidence) {
    output += `- **Confidence**: ${info.sourceConfidence}\n`;
  }
  if (sourceDebugSignals.length > 0) {
    output += `- **Confidence Signals**: ${sourceDebugSignals.join(', ')}\n`;
  }

  if (textPreview) {
    output += `\n### Element Text\n${textPreview}\n`;
  }

  if (htmlPreview) {
    const longestBacktickRun = (htmlPreview.match(/`+/g) ?? []).reduce(
      (max, run) => Math.max(max, run.length),
      0,
    );
    const fence = longestBacktickRun >= 3 ? '~'.repeat(longestBacktickRun + 1) : '```';
    output += `\n### Element HTML\n${fence}html\n${htmlPreview}\n${fence}\n`;
  }

  if (userNote?.trim()) {
    output += `\n## Note\n${userNote.trim()}`;
  }

  return output.trimEnd();
}
