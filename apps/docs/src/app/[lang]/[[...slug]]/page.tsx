import { getPageImage, source } from '@/lib/source';
import { docsHomePath } from '@/lib/docs-paths';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { notFound, redirect } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { LLMCopyButton, ViewOptions } from '@/components/ai/page-actions';
import { Overlay } from '@/components/overlay';

export default async function Page(props: {
  params: Promise<{ lang: string; slug?: string[] }>;
}) {
  const { lang, slug } = await props.params;

  if (!slug || slug.length === 0) {
    redirect(docsHomePath(lang));
  }

  const page = source.getPage(slug, lang);
  if (!page) notFound();

  const loaded = await page.data.load();
  const MDX = loaded.body;
  const gitConfig = {
    user: process.env.NEXT_PUBLIC_GIT_USER ?? 'AruNi-01',
    repo: process.env.NEXT_PUBLIC_GIT_REPO ?? 'atmos',
    branch: process.env.NEXT_PUBLIC_GIT_BRANCH ?? 'main',
  };

  return (
    <DocsPage
      toc={loaded.toc}
      full={page.data.full}
      tableOfContent={{
        style: 'clerk',
      }}
      tableOfContentPopover={{
        style: 'clerk',
      }}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pb-6">
        <LLMCopyButton markdownUrl={`${page.url}.mdx`} />
        <ViewOptions
          markdownUrl={`${page.url}.mdx`}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/docs/content/docs/${page.path}`}
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
      <Overlay />
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ lang: string; slug?: string[] }>;
}): Promise<Metadata> {
  const { lang, slug } = await props.params;

  if (!slug || slug.length === 0) {
    const introduction = source.getPage(['introduction'], lang);
    if (!introduction) notFound();
    return {
      title: introduction.data.title,
      description: introduction.data.description,
    };
  }

  const page = source.getPage(slug, lang);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImage(page).url,
    },
  };
}
