import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { link, skipUnlessWorkspace, workspaceId } from './env.ts';

// Paired app: the workspace terminal route opens and a new terminal can be created.
test('opens a terminal', { skip: skipUnlessWorkspace }, async ({ app, device, screen }) => {
  await app.open();
  await device.openLink(link(`/workspace/${workspaceId}/terminal`));

  const newTerminal = screen.getByLabel('New terminal');
  await expect(newTerminal).toBeVisible();
  await newTerminal.tap();
  await expect(screen.getByText('Terminal')).toBeVisible({ timeout: 20_000 });
});
