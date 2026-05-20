'use client';

import { docsBasePath, docsHomePath } from '@/lib/docs-paths';
import { i18n as i18nConfig } from '@/lib/i18n';
import { usePathname, useRouter } from 'next/navigation';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ComponentProps } from 'react';

export function DocsRootProvider({
  children,
  theme,
  i18n: i18nProps,
  ...props
}: ComponentProps<typeof RootProvider>) {
  const router = useRouter();
  const pathname = usePathname();

  const i18n = i18nProps
    ? {
        ...i18nProps,
        onLocaleChange: (locale: string) => {
          if (!i18nConfig.languages.includes(locale as (typeof i18nConfig.languages)[number])) {
            return;
          }
          const segments = pathname.split('/').filter(Boolean);
          if (segments[0] && i18nConfig.languages.includes(segments[0] as (typeof i18nConfig.languages)[number])) {
            segments.shift();
          }
          const prefix = docsBasePath(locale);
          const next =
            segments.length > 0
              ? `${prefix}/${segments.join('/')}`.replace(/\/+/g, '/')
              : docsHomePath(locale);
          router.push(next);
        },
      }
    : undefined;
  // React 19 warns when next-themes injects a <script> during client renders
  // (e.g. locale navigation). Keep the blocking script on SSR; on the client use
  // type="application/json" so React does not try to execute it again.
  // @see https://github.com/pacocoursey/next-themes/issues/387
  const themeScriptProps =
    typeof window === 'undefined'
      ? undefined
      : ({ type: 'application/json' } as const);

  return (
    <RootProvider
      {...props}
      i18n={i18n}
      theme={{
        ...theme,
        scriptProps: theme?.scriptProps ?? themeScriptProps,
      }}
    >
      {children}
    </RootProvider>
  );
}
