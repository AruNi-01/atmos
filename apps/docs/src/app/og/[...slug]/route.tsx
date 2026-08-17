import { readFile } from 'node:fs/promises';
import { getPageImage, source } from '@/lib/source';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { generate as DefaultImage } from 'fumadocs-ui/og';

export const revalidate = false;

async function brandIconSrc(): Promise<string> {
  const bytes = await readFile(new URL('../../icon.png', import.meta.url));
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

export async function GET(_req: Request, { params }: RouteContext<'/og/[...slug]'>) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  const iconSrc = await brandIconSrc();

  return new ImageResponse(
    <DefaultImage
      title={page.data.title ?? 'Atmos'}
      description={page.data.description ?? ''}
      site="Atmos"
      icon={<img src={iconSrc} width={56} height={56} alt="" />}
      primaryColor="#71717a"
      primaryTextColor="#e4e4e7"
    />,
    {
      width: 1200,
      height: 630,
    },
  );
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageImage(page).segments,
  }));
}
