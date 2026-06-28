import { createTranslator } from 'next-intl';
import { currentAppLocale } from '@/shared/lib/current-app-locale';
import { isTauriRuntime } from '@/shared/lib/desktop-runtime';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';

export type RegistrationMeta = {
  via: string;
  version?: string;
};

let cachedRuntimeLocale: 'en' | 'zh' | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedRuntimeTranslator: any = null;

function runtimeT(key: string): string {
  const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedRuntimeTranslator || cachedRuntimeLocale !== locale) {
    cachedRuntimeLocale = locale;
    cachedRuntimeTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'project.runtime',
    });
  }
  return cachedRuntimeTranslator(key as never);
}

const WEB_APP_VERSION =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_VERSION
    ? process.env.NEXT_PUBLIC_APP_VERSION
    : '0.1.0';

function isLocalWebRuntimeBuild(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_BUILD_TARGET === 'local-web'
  );
}

export async function buildRegistrationMeta(): Promise<RegistrationMeta> {
  if (isTauriRuntime()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const info = (await invoke('get_version_info')) as { version?: string };
      return {
        via: 'desktop',
        version: info.version?.trim() || undefined,
      };
    } catch {
      return { via: 'desktop' };
    }
  }

  if (isLocalWebRuntimeBuild()) {
    return {
      via: 'local-web-runtime',
      version: WEB_APP_VERSION,
    };
  }

  return {
    via: 'web',
    version: WEB_APP_VERSION,
  };
}

export function formatRegistrationVia(via: string | undefined): string {
  if (!via?.trim()) {
    return '—';
  }
  switch (via) {
    case 'web':
      return runtimeT('registrationMeta.via.web');
    case 'desktop':
      return runtimeT('registrationMeta.via.desktop');
    case 'cli':
      return runtimeT('registrationMeta.via.cli');
    case 'env':
      return runtimeT('registrationMeta.via.env');
    case 'local-web-runtime':
      return runtimeT('registrationMeta.via.localWebRuntime');
    default:
      return via;
  }
}

export function registrationMetaFromRecord(
  raw: Record<string, unknown> | null | undefined,
): RegistrationMeta | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const via = typeof raw.via === 'string' ? raw.via : null;
  if (!via) {
    return null;
  }
  const version = typeof raw.version === 'string' ? raw.version : undefined;
  return { via, version };
}
