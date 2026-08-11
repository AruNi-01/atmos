/**
 * Drizzle Kit config for Cloudflare D1.
 * @see https://orm.drizzle.team/docs/get-started/d1-new
 * @see https://orm.drizzle.team/docs/connect-cloudflare-d1
 *
 * Generate (no remote creds needed):
 *   bunx drizzle-kit generate
 *
 * Push / migrate remote (needs Cloudflare env):
 *   CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_DATABASE_ID=… CLOUDFLARE_D1_TOKEN=…
 *   bunx drizzle-kit push
 */
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  driver: "d1-http",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? "",
    token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
  },
});
