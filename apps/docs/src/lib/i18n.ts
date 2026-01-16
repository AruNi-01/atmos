import { defineI18n } from 'fumadocs-core/i18n';

export const i18n = defineI18n({
  defaultLanguage: 'en',
  languages: ['en', 'zh'],
  hideLocale: 'default-locale', // /docs -> English, /zh/docs -> Chinese
});

export const localeNames: Record<string, string> = {
  en: 'English',
  zh: '中文',
};
