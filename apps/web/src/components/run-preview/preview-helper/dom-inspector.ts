import type { PreviewElementContext, PreviewElementRect } from './types';

const TEXT_PREVIEW_LIMIT = 280;
const HTML_PREVIEW_LIMIT = 1600;

function truncate(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function escapeCssValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

function collectStableAttributes(element: Element): string[] {
  const stableNames = ['data-testid', 'data-test', 'data-cy', 'role', 'aria-label', 'name'];
  const pairs = stableNames
    .map((name) => [name, element.getAttribute(name)] as const)
    .filter(([, value]) => !!value)
    .map(([name, value]) => `[${name}="${value}"]`);

  return pairs;
}

function hasBaseVal(
  value: unknown,
): value is {
  baseVal: string;
} {
  return !!value && typeof value === 'object' && 'baseVal' in value && typeof value.baseVal === 'string';
}

function getElementClassNames(element: Element): string[] {
  const rawClassName: unknown = (element as Element & Record<string, unknown>).className;

  if (typeof rawClassName === 'string') {
    return rawClassName
      .split(/\s+/)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  if (hasBaseVal(rawClassName)) {
    return rawClassName.baseVal
      .split(/\s+/)
      .map((name: string) => name.trim())
      .filter(Boolean);
  }

  const attrClassName = element.getAttribute('class') || '';
  return attrClassName
    .split(/\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function buildElementSelector(element: Element): string {
  const tagName = element.tagName.toLowerCase();
  const id = element.getAttribute('id');
  if (id) {
    return `#${escapeCssValue(id)}`;
  }

  const stableAttributes = collectStableAttributes(element);
  if (stableAttributes.length > 0) {
    return `${tagName}${stableAttributes[0]}`;
  }

  const path: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  while (current && current.tagName.toLowerCase() !== 'html' && depth < 5) {
    const currentTag = current.tagName.toLowerCase();
    const currentId = current.getAttribute('id');
    if (currentId) {
      path.unshift(`#${escapeCssValue(currentId)}`);
      break;
    }

    const currentStable = collectStableAttributes(current);
    if (currentStable.length > 0) {
      path.unshift(`${currentTag}${currentStable[0]}`);
      break;
    }

    const className = getElementClassNames(current)
      .slice(0, 2)
      .map((name) => `.${escapeCssValue(name)}`)
      .join('');

    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (sibling) => sibling.tagName.toLowerCase() === currentTag,
        )
      : [];
    const nthSuffix =
      siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : '';

    path.unshift(`${currentTag}${className}${nthSuffix}`);
    current = current.parentElement;
    depth += 1;
  }

  return path.join(' > ') || tagName;
}

export function getPreviewElementRect(element: Element): PreviewElementRect {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

export function inspectPreviewElement(element: Element): PreviewElementContext {
  const tagName = element.tagName.toLowerCase();
  const attributes = [
    element.getAttribute('id') ? `id="${element.getAttribute('id')}"` : null,
    element.getAttribute('class') ? `class="${truncate(element.getAttribute('class') || '', 80)}"` : null,
    ...['data-testid', 'data-test', 'data-cy', 'role', 'aria-label']
      .map((name) => {
        const value = element.getAttribute(name);
        return value ? `${name}="${truncate(value, 60)}"` : null;
      }),
  ].filter(Boolean);

  const textPreview = truncate(element.textContent || '', TEXT_PREVIEW_LIMIT);
  const htmlPreview = truncate(element.outerHTML || '', HTML_PREVIEW_LIMIT);

  return {
    selector: buildElementSelector(element),
    tagName,
    attributesSummary: attributes.length > 0 ? attributes.join(' ') : undefined,
    textPreview: textPreview || undefined,
    htmlPreview: htmlPreview || undefined,
    selectedText: textPreview || `<${tagName}>`,
  };
}
