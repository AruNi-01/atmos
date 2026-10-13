import type { E2EConfig } from 'e2e';
import { mobile } from '@e2e-dev/mobile';
import { gateway } from 'ai';

// Atmos mobile (apps/mobile/app.json): iOS bundleIdentifier and Android package
// are both land.atmos.mobile. Build and install a dev/release build first
// (`bun run ios` / `bun run android` in apps/mobile); the tests open whatever
// is installed under this id. One simulator, one app: never run two workers.
const app = { bundleId: 'land.atmos.mobile' };

export default {
  // Only tests that call `agent` need a model. The Vercel AI Gateway reads
  // AI_GATEWAY_API_KEY. The smoke tests in tests/ are deterministic.
  agents: {
    default: {
      model: gateway('openai/gpt-6-luna-fast'),
      system: 'You are a thorough QA agent testing the Atmos mobile app. Verify every outcome.',
    },
  },
  tests: 'tests/**/*.e2e.ts',
  targets: [
    { name: 'ios', engine: mobile({ platform: 'ios' }), app },
    { name: 'android', engine: mobile({ platform: 'android' }), app },
  ],
  workers: 1,
} satisfies E2EConfig;
