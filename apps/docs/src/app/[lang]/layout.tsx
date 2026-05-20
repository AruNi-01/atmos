import { DocsRootProvider } from '@/components/docs-root-provider';
import { i18n } from '@/lib/i18n';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
});

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  return (
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <DocsRootProvider
          i18n={{
            locale: lang,
            locales: i18n.languages.map((l) => ({
              locale: l,
              name: l === 'zh' ? '中文' : 'English',
            })),
          }}
        >
          {children}
        </DocsRootProvider>
      </body>
    </html>
  );
}

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}
