import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { skipUnlessWorkspace, workspaceTitle } from './env.ts';

// Paired app: the workspace list shows the seeded workspace, and tapping it
// opens the workspace (route /workspace/<guid>).
test('opens a workspace from the list', { skip: skipUnlessWorkspace }, async ({ app, screen }) => {
  await app.open();
  const row = screen.getByText(workspaceTitle);
  await expect(row).toBeVisible();
  await row.tap();
  // The workspace screen offers "New terminal" in its header.
  await expect(screen.getByLabel('New terminal')).toBeVisible();
});
