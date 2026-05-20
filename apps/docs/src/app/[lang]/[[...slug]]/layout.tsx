import { DocsLayoutShell } from '@/components/docs-layout-shell';
import { source } from '@/lib/source';

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <DocsLayoutShell tree={source.getPageTree(lang)}>{children}</DocsLayoutShell>
  );
}
