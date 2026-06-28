/**
 * Format selection info for AI Agent consumption
 */

import { createTranslator } from 'next-intl';
import enMessages from '../../../messages/en.json';
import zhMessages from '../../../messages/zh.json';
import { detectCodeLanguage } from '@/shared/lib/code-language';
import { currentAppLocale } from '@/shared/lib/current-app-locale';

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
  previewRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
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

let cachedSelectionLocale: 'en' | 'zh' | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedSelectionTranslator: any = null;

function selectionT(key: string, values?: Record<string, string | number>): string {
  const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedSelectionTranslator || cachedSelectionLocale !== locale) {
    cachedSelectionLocale = locale;
    cachedSelectionTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'Selection.chrome',
    });
  }
  return cachedSelectionTranslator(key as never, values as never);
}

/**
 * Format editor selection for AI
 */
export function formatEditorSelectionForAI(
  info: SelectionInfo,
  userNote?: string
): string {
  const language = info.language || getLanguageFromPath(info.filePath);

  let output = `## ${selectionT('formatSelection.codeSnippet')}\n`;
  output += `- **${selectionT('formatSelection.file')}**: \`${info.filePath}\`\n`;
  if (info.startLine > 0) {
    const lineRange = formatLineRange(info.startLine, info.endLine);
    output += `- **${selectionT('formatSelection.lines')}**: ${lineRange}\n`;
  }
  output += `\n\`\`\`${language}\n${info.selectedText}\n\`\`\``;

  if (userNote?.trim()) {
    output += `\n\n## ${selectionT('formatSelection.note')}\n${userNote.trim()}`;
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

  let output = `## ${selectionT('formatSelection.codeChange')}\n`;
  output += `- **${selectionT('formatSelection.file')}**: \`${info.filePath}\`\n`;
  output += `- **${selectionT('formatSelection.lines')}**: ${lineRange}\n`;

  if (info.changeType) {
    const changeTypeLabels: Record<string, string> = {
      addition: selectionT('formatSelection.changeType.addition'),
      deletion: selectionT('formatSelection.changeType.deletion'),
      context: selectionT('formatSelection.changeType.context'),
      mixed: selectionT('formatSelection.changeType.mixed'),
    };
    output += `- **${selectionT('formatSelection.changeType.label')}**: ${changeTypeLabels[info.changeType] || info.changeType}\n`;
  }

  output += '\n';

  const hasBefore = info.beforeText != null;
  const hasAfter = info.afterText != null;

  if (hasBefore && hasAfter) {
    output += `### ${selectionT('formatSelection.changeBefore')}\n`;
    output += `\`\`\`${language}\n${info.beforeText}\n\`\`\`\n\n`;
    output += `### ${selectionT('formatSelection.changeAfter')}\n`;
    output += `\`\`\`${language}\n${info.afterText}\n\`\`\``;
  } else if (hasBefore && !hasAfter) {
    output += `### ${selectionT('formatSelection.deleted')}\n`;
    output += `\`\`\`${language}\n${info.beforeText}\n\`\`\``;
  } else if (!hasBefore && hasAfter) {
    output += `### ${selectionT('formatSelection.added')}\n`;
    output += `\`\`\`${language}\n${info.afterText}\n\`\`\``;
  } else {
    output += `\`\`\`${language}\n${info.selectedText}\n\`\`\``;
  }

  if (userNote?.trim()) {
    output += `\n\n## ${selectionT('formatSelection.note')}\n${userNote.trim()}`;
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

  let output = `## ${selectionT('formatSelection.wikiExcerpt')}\n`;
  output += `- **${selectionT('formatSelection.wikiRoot')}**: \`${wikiRoot}/\`\n`;
  output += `- **${selectionT('formatSelection.wikiPage')}**: \`${wikiPagePath}\`\n`;
  if (info.sectionTitle?.trim()) {
    output += `- **${selectionT('formatSelection.section')}**: \`${info.sectionTitle.trim()}\`\n`;
  }

  output += `\n~~~markdown\n${selectedText}\n~~~`;
  output += `\n\n## ${selectionT('formatSelection.locateRule')}\n${selectionT('formatSelection.locateRuleDescription', { wikiRoot })}`;

  if (userNote?.trim()) {
    output += `\n\n## ${selectionT('formatSelection.ask')}\n${userNote.trim()}`;
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

  let output = `## ${selectionT('formatSelection.previewElement')}\n`;
  output += `- **${selectionT('formatSelection.page')}**: \`${info.pageUrl || info.filePath}\`\n`;
  if (info.selector) {
    output += `- **${selectionT('formatSelection.selector')}**: \`${info.selector}\`\n`;
  }
  if (info.tagName) {
    output += `- **${selectionT('formatSelection.tag')}**: \`${info.tagName}\`\n`;
  }
  if (info.attributesSummary) {
    output += `- **${selectionT('formatSelection.attributes')}**: ${info.attributesSummary}\n`;
  }
  if (info.framework) {
    output += `- **${selectionT('formatSelection.framework')}**: ${info.framework}\n`;
  }
  if (info.transportMode) {
    output += `- **${selectionT('formatSelection.sourceMode')}**: ${info.transportMode}\n`;
  }
  if (info.componentName) {
    output += `- **${selectionT('formatSelection.sourceComponent')}**: \`${info.componentName}\`\n`;
  }
  if (componentChain.length > 1) {
    output += `- **${selectionT('formatSelection.sourceComponentChain')}**: ${componentChain.join(' -> ')}\n`;
  }
  if (sourceParts.length > 0) {
    output += `- **${selectionT('formatSelection.source')}**: \`${sourceParts.join(':')}\`\n`;
  }
  if (info.sourceConfidence) {
    output += `- **${selectionT('formatSelection.confidence')}**: ${info.sourceConfidence}\n`;
  }
  if (sourceDebugSignals.length > 0) {
    output += `- **${selectionT('formatSelection.confidenceSignals')}**: ${sourceDebugSignals.join(', ')}\n`;
  }

  if (textPreview) {
    output += `\n### ${selectionT('formatSelection.elementText')}\n${textPreview}\n`;
  }

  if (htmlPreview) {
    const longestBacktickRun = (htmlPreview.match(/`+/g) ?? []).reduce(
      (max, run) => Math.max(max, run.length),
      0,
    );
    const fence = longestBacktickRun >= 3 ? '~'.repeat(longestBacktickRun + 1) : '```';
    output += `\n### ${selectionT('formatSelection.elementHtml')}\n${fence}html\n${htmlPreview}\n${fence}\n`;
  }

  if (userNote?.trim()) {
    output += `\n## ${selectionT('formatSelection.note')}\n${userNote.trim()}`;
  }

  return output.trimEnd();
}
