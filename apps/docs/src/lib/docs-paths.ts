import { i18n } from '@/lib/i18n';

export function docsBasePath(lang: (typeof i18n.languages)[number] | string): string {
  return lang === i18n.defaultLanguage ? '' : `/${lang}`;
}

/** Locale-aware docs home (introduction). */
export function docsHomePath(lang: (typeof i18n.languages)[number] | string): string {
  const path = `${docsBasePath(lang)}/introduction`;
  return path.replace(/\/+/g, '/') || '/introduction';
}
