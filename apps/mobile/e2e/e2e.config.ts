import { execFileSync } from "node:child_process";
import type { E2EConfig } from "e2e";
import { mobile } from "@e2e-dev/mobile";
import { gateway } from "ai";

// Local agent e2e only; the headless CI Playwright suite lives in /e2e.
// Several simulators are usually booted, so pin one by UDID. scripts/resolve-device.mjs
// defaults to iPhone 17 Pro on iOS 26.5; override with ATMOS_E2E_DEVICE (UDID or name).
// Telemetry stays off unless the caller sets E2E_TELEMETRY_DISABLED themselves.
process.env.E2E_TELEMETRY_DISABLED ??= "1";
function iosDevice(): string | undefined {
  if (process.platform !== "darwin") return undefined;
  try {
    return execFileSync(
      "node",
      [new URL("./scripts/resolve-device.mjs", import.meta.url).pathname],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
  } catch {
    return undefined;
  }
}

// Atmos mobile (apps/mobile/app.json): iOS bundleIdentifier and Android package
// are both land.atmos.mobile. Build and install a dev/release build first
// (`bun run ios` / `bun run android` in apps/mobile); the tests open whatever
// is installed under this id. One simulator, one app: never run two workers.
const app = { bundleId: "land.atmos.mobile" };

export default {
  // Only tests that call `agent` need a model. The Vercel AI Gateway reads
  // AI_GATEWAY_API_KEY. The smoke tests in tests/ are deterministic.
  agents: {
    default: {
      model: gateway("openai/gpt-6-luna-fast"),
      system: "You are a thorough QA agent testing the Atmos mobile app. Verify every outcome.",
    },
  },
  tests: "tests/**/*.e2e.ts",
  targets: [
    { name: "ios", engine: mobile({ platform: "ios", device: iosDevice() }), app },
    { name: "android", engine: mobile({ platform: "android" }), app },
  ],
  workers: 1,
} satisfies E2EConfig;
