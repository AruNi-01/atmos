import { isTauriRuntime } from '@/shared/lib/desktop-runtime';

export type RegistrationMeta = {
  via: string;
  version?: string;
};

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

const VIA_LABELS: Record<string, string> = {
  web: 'Web app',
  desktop: 'Desktop',
  cli: 'CLI',
  env: 'Install script',
  'local-web-runtime': 'Local web runtime',
};

export function formatRegistrationVia(via: string | undefined): string {
  if (!via?.trim()) {
    return '—';
  }
  return VIA_LABELS[via] ?? via;
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
