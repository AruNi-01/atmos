import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { link, skipUnlessWorkspace, workspaceId } from './env.ts';

// Paired app: a new agent chat accepts a message and opens the thread.
// This sends a real prompt to the agent on the paired Computer.
test('sends an agent message', { skip: skipUnlessWorkspace }, async ({ app, device, screen }) => {
  await app.open();
  await device.openLink(link(`/workspace/${workspaceId}/chat/new`));

  const composer = screen.getByPlaceholder('Send a message to create a session');
  await expect(composer).toBeVisible();
  await composer.fill('Reply with the single word: pong');
  await screen.getByLabel('Send').tap();

  // The new-session placeholder is gone once the thread screen takes over,
  // and the message we sent is in the transcript.
  await expect(screen.getByText('Reply with the single word: pong')).toBeVisible({ timeout: 30_000 });
});
