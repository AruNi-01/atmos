import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(nav?: BaseLayoutProps['nav']): BaseLayoutProps {
  return {
    nav,
    githubUrl: 'https://github.com/AruNi-01/atmos',
    i18n: true,
  };
}
