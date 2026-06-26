import {
  DEFAULT_RELAY_URL,
  resolveRelayUrl,
} from '@/features/connection/lib/atmos-computer-store';

export const REMOTE_COMPUTER_INSTALL_SCRIPT_URL =
  'https://install.atmos.land/install-local-web-runtime.sh';

/** One-shot install: `atmos` CLI + local API runtime under ~/.atmos. */
export function buildRemoteComputerInstallCommand(): string {
  return `curl -fsSL ${REMOTE_COMPUTER_INSTALL_SCRIPT_URL} | bash -s -- --no-start --no-open`;
}

/** Install Atmos, register this host on the relay, and start API in the background. */
export function buildRemoteComputerSetupCommand(opts: {
  registerToken: string;
  relayUrl: string;
  relaySecretKey?: string;
}): string {
  const relayOrigin = resolveRelayUrl(opts.relayUrl);
  const token = shellQuote(opts.registerToken);
  const relaySecret = opts.relaySecretKey?.trim();
  const relayLine =
    relayOrigin === DEFAULT_RELAY_URL ? null : `  --relay ${shellQuote(relayOrigin)} \\`;
  const lines = [
    `curl -fsSL ${REMOTE_COMPUTER_INSTALL_SCRIPT_URL} | bash -s -- \\`,
    `  --token ${token} \\`,
    relayLine,
    relaySecret ? `  --relay-secret-key ${shellQuote(relaySecret)} \\` : null,
    '  --daemon',
  ].filter((line): line is string => Boolean(line));
  return lines.join('\n');
}

export function buildRemoteComputerSetupPlaceholderCommand(relayUrl: string): string {
  const relayOrigin = resolveRelayUrl(relayUrl);
  const relayLine =
    relayOrigin === DEFAULT_RELAY_URL ? null : `  --relay ${shellQuote(relayOrigin)} \\`;
  return [
    `curl -fsSL ${REMOTE_COMPUTER_INSTALL_SCRIPT_URL} | bash -s -- \\`,
    '  --token <registration_code> \\',
    relayLine,
    '  --daemon',
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
