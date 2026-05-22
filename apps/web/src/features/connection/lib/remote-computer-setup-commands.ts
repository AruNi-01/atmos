import { resolveControlPlaneUrl } from '@/features/connection/lib/atmos-computer-store';

export const REMOTE_COMPUTER_INSTALL_SCRIPT_URL =
  'https://install.atmos.land/install-local-web-runtime.sh';

/** One-shot install: `atmos` CLI + local API runtime under ~/.atmos. */
export function buildRemoteComputerInstallCommand(): string {
  return `curl -fsSL ${REMOTE_COMPUTER_INSTALL_SCRIPT_URL} | bash -s -- --no-start --no-open`;
}

/** Register this host on the control plane and start API in the background. */
export function buildRemoteComputerStartCommand(opts: {
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
