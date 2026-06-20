import { resolveRelayUrl } from '@/features/connection/lib/atmos-computer-store';

export const REMOTE_COMPUTER_INSTALL_SCRIPT_URL =
  'https://install.atmos.land/install-local-web-runtime.sh';

/** One-shot install: `atmos` CLI + local API runtime under ~/.atmos. */
export function buildRemoteComputerInstallCommand(): string {
  return `curl -fsSL ${REMOTE_COMPUTER_INSTALL_SCRIPT_URL} | bash -s -- --no-start --no-open`;
}

/** Register this host on the relay and start API in the background. */
export function buildRemoteComputerStartCommand(opts: {
  registerToken: string;
  relayUrl: string;
  relaySecretKey?: string;
}): string {
  const relayOrigin = resolveRelayUrl(opts.relayUrl);
  const token = shellQuote(opts.registerToken);
  const relaySecret = opts.relaySecretKey?.trim();
  const lines = [
    'export PATH="$HOME/.atmos/bin:$PATH"',
    relaySecret ? `export ATMOS_RELAY_SECRET_KEY=${shellQuote(relaySecret)}` : null,
    'atmos computer start \\',
    `  --token ${token} \\`,
    '  --display-name "$(hostname -s)" \\',
    `  --relay ${shellQuote(relayOrigin)} \\`,
    '  --daemon',
  ].filter((line): line is string => Boolean(line));
  return lines.join('\n');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
