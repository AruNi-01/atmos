/**
 * Legacy cleanup for previously cached registration codes.
 * Registration codes are one-time credentials and should not be persisted in the browser.
 */

import { globalKey, removeKey } from '@/shared/lib/browser-store';

const CACHE_KEY = globalKey('remote-computer-register-token');

export function clearRemoteComputerRegisterTokenCache(): void {
  removeKey(CACHE_KEY);
}
