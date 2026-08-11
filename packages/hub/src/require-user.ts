/**
 * Unified Hub product identity: Better Auth session cookie **or**
 * Hub-minted device Bearer → same `{ userId, email, name }`.
 *
 * Product routes must use `requireUser` only. Do not reintroduce
 * cookie-only gates for features that Desktop/device clients need.
 */
import { eq } from "drizzle-orm";
import { createAuth } from "./auth";
import { createDb } from "./db/client";
import { user } from "./db/schema";
import type { HubEnv } from "./env";

export type HubUser = {
  userId: string;
  email?: string | null;
  name?: string | null;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sessionCookieHeaders(request: Request): Headers {
  return new Headers({
    cookie: request.headers.get("cookie") ?? "",
    origin: request.headers.get("origin") ?? "",
  });
}

function authFromEnv(env: HubEnv) {
  const db = createDb(env);
  return createAuth(db, env);
}

/** Cookie session only — use for OAuth handoff that mints the first device. */
export async function requireSession(
  env: HubEnv,
  request: Request,
): Promise<HubUser | Response> {
  const auth = authFromEnv(env);
  const session = await auth.api.getSession({
    headers: sessionCookieHeaders(request),
  });
  if (!session?.user?.id) {
    return json({ error: "unauthorized", message: "Sign in required" }, 401);
  }
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

/**
 * Product identity for `/v1/me/*`, integrations, usage shares, etc.
 * Accepts session cookie or `Authorization: Bearer <device_credential>`.
 */
export async function requireUser(
  env: HubEnv,
  request: Request,
): Promise<HubUser | Response> {
  const session = await requireSession(env, request);
  if (!(session instanceof Response)) {
    return session;
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return session;
  }
  const credential = authHeader.slice("Bearer ".length).trim();
  if (credential.length < 32) {
    return session;
  }

  const db = createDb(env);
  const { verifyDeviceCredential } = await import("./devices");
  const device = await verifyDeviceCredential(db, credential);
  if (!device) {
    return json(
      { error: "unauthorized", message: "Sign in or enroll a device" },
      401,
    );
  }

  const rows = await db
    .select({
      email: user.email,
      name: user.name,
    })
    .from(user)
    .where(eq(user.id, device.userId))
    .limit(1);
  const row = rows[0];
  return {
    userId: device.userId,
    email: row?.email ?? null,
    name: row?.name ?? null,
  };
}
