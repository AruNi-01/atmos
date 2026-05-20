import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
    // Eager frontmatter imports so sidebar/page titles resolve outside the MDX bundler.
    async: true,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    preset: 'fumadocs',
  },
});
