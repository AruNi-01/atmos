/**
 * Signed-in smoke tests need a simulator whose installed app is already
 * paired with a running Atmos Computer (pairing is a camera QR scan or an
 * OAuth browser hop, neither of which a deterministic test can drive).
 *
 *   ATMOS_E2E_PAIRED=1             the installed app is paired and online
 *   ATMOS_E2E_WORKSPACE_ID=<guid>  a workspace on that Computer
 *   ATMOS_E2E_WORKSPACE_TITLE=...  its title as shown in the workspace list
 */
export const paired = process.env.ATMOS_E2E_PAIRED === '1';
export const workspaceId = process.env.ATMOS_E2E_WORKSPACE_ID ?? '';
export const workspaceTitle = process.env.ATMOS_E2E_WORKSPACE_TITLE ?? '';

export const skipUnlessPaired: false | string = paired
  ? false
  : 'set ATMOS_E2E_PAIRED=1 on a simulator whose app is paired with a Computer';

export const skipUnlessWorkspace: false | string =
  skipUnlessPaired || (workspaceId && workspaceTitle
    ? false
    : 'set ATMOS_E2E_WORKSPACE_ID and ATMOS_E2E_WORKSPACE_TITLE');

/** expo-router deep link (app.json scheme `atmos`). */
export const link = (path: string) => `atmos://${path.replace(/^\//, '')}`;
