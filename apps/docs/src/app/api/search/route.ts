import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

export const revalidate = false;

const search = createFromSource(source, {
  // https://docs.orama.com/docs/orama-js/supported-languages
  language: 'english',
  localeMap: {
    zh: 'english',
  },
});

export const GET = process.env.BUILD_TARGET === 'pages' ? search.staticGET : search.GET;
