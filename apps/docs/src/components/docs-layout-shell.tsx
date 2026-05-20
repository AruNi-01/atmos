'use client';

import { AtmosLogo } from '@/components/atmos-logo';
import { baseOptions } from '@/lib/layout.shared';
import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/layouts/docs/slots/sidebar';
import type * as PageTree from 'fumadocs-core/page-tree';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { AppWindow, Terminal } from 'lucide-react';
import type { ReactNode } from 'react';

type DocsLayoutShellProps = {
  tree: PageTree.Root;
  children: ReactNode;
};

/** Client shell so `nav.title` can be a component (non-link brand). */
export function DocsLayoutShell({ tree, children }: DocsLayoutShellProps) {
  return (
    <DocsLayout
      tree={tree}
      tabs={{
        transform: (option, node) => {
          const isCli = node.name === 'Atmos CLI' || option.url.includes('/cli');
          return {
            ...option,
            title: isCli ? 'Atmos CLI' : 'Atmos App',
            icon: isCli ? <Terminal /> : <AppWindow />,
          };
        },
      }}
      {...baseOptions({ title: AtmosLogo })}
      slots={{
        sidebar: {
          provider: SidebarProvider,
          root: Sidebar,
          trigger: SidebarTrigger,
          useSidebar,
        },
      }}
    >
      {children}
    </DocsLayout>
  );
}
