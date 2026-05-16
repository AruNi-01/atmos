import { resolveControlPlaneUrl } from '@/lib/atmos-computer-store';

export const VPS_INSTALL_SCRIPT_URL = 'https://install.atmos.land/install-local-web-runtime.sh';

/** One-shot install: `atmos` CLI + local API runtime under ~/.atmos (Linux x86_64 / macOS). */
export function buildVpsInstallCommand(): string {
  return `curl -fsSL ${VPS_INSTALL_SCRIPT_URL} | bash -s -- --no-start --no-open`;
}

/** Register this host on the control plane and start API in the background. */
export function buildVpsStartCommand(opts: {
  registerToken: string;
  controlPlaneUrl: string;
}): string {
  const cp = resolveControlPlaneUrl(opts.controlPlaneUrl);
  const token = opts.registerToken.replace(/'/g, `'\\''`);
  return [
    'export PATH="$HOME/.atmos/bin:$PATH"',
    'atmos computer start \\',
    `  --token '${token}' \\`,
    '  --display-name "$(hostname -s)" \\',
    `  --control-plane ${cp} \\`,
    '  --daemon',
  ].join('\n');
}
