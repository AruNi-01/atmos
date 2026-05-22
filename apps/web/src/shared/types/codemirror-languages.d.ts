declare module '@codemirror/lang-vue' {
  import type { LanguageSupport, LRLanguage } from '@codemirror/language';

  export const vueLanguage: LRLanguage;
  export function vue(config?: { base?: LanguageSupport }): LanguageSupport;
}

declare module '@replit/codemirror-lang-svelte' {
  import type { Parser } from '@lezer/common';
  import type { LanguageSupport, LRLanguage } from '@codemirror/language';

  export const svelteLanguage: LRLanguage;
  export const svelteParser: Parser;
  export function svelte(): LanguageSupport;
}
