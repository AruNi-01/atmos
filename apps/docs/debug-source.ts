import { source } from './src/lib/source';

console.log('Pages:', source.getPages().map(p => ({ url: p.url, slug: p.slugs, lang: p.locale })));
