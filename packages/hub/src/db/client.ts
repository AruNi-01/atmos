/**
 * Drizzle ↔ Cloudflare D1 connection.
 * @see https://orm.drizzle.team/docs/connect-cloudflare-d1
 */
import { drizzle } from "drizzle-orm/d1";
import type { HubEnv } from "../env";
import * as schema from "./schema";

export function createDb(env: HubEnv) {
  // Official pattern: drizzle(env.DB) — pass schema for typed queries + relations.
  return drizzle(env.DB, { schema });
}

export type HubDb = ReturnType<typeof createDb>;
