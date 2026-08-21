'use client';

import { AtmosLogo } from '@/components/atmos-logo';
import { baseOptions } from '@/lib/layout.shared';
import type * as PageTree from 'fumadocs-core/page-tree';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { GetSidebarTabsOptions } from 'fumadocs-ui/utils/get-sidebar-tabs';
import { AppWindow, Terminal } from 'lucide-react';
import type { ReactNode } from 'react';

type DocsLayoutShellProps = {
  tree: PageTree.Root;
  children: ReactNode;
};

/** Client shell so `nav.title` can be a component (brand link). */
export function DocsLayoutShell({ tree, children }: DocsLayoutShellProps) {
  const sidebarTabs: GetSidebarTabsOptions = {
    transform: (option, node) => {
      const isCli = node.name === 'Atmos CLI' || option.url.includes('/cli');
      return {
        ...option,
        title: isCli ? 'Atmos CLI' : 'Atmos App',
        description: undefined,
        icon: (
          <span className="flex size-full items-center justify-center">
            {isCli ? <Terminal className="size-3.5" /> : <AppWindow className="size-3.5" />}
          </span>
        ),
      };
    },
  };

  return (
    <DocsLayout
      tree={tree}
      {...baseOptions({ title: AtmosLogo })}
      sidebar={{
        tabs: sidebarTabs,
      }}
    >
      {children}
    </DocsLayout>
  );
}
