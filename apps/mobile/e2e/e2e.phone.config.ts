import type { E2EConfig } from "e2e";
import { mobile } from "@e2e-dev/mobile";

// Physical iPhone only. Signing uses the personal Apple Development team
// (S3XZS3543W), never the company team.
process.env.E2E_TELEMETRY_DISABLED ??= "1";

const iphone = mobile({ platform: "ios", device: "AarynLu的iPhone" });

export default {
  tests: "phone/verify.e2e.ts",
  targets: [
    {
      name: "iphone",
      engine: iphone,
      app: { bundleId: "land.atmos.mobile" },
    },
  ],
  workers: 1,
} satisfies E2EConfig;
