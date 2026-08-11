import { and, eq, isNull } from "drizzle-orm";
import type { HubDb } from "./db/client";
import { devices } from "./db/schema";

function randomId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

function randomCredential(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(40));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Mint device credential — plaintext returned once (APP-056 M13). */
export async function mintDevice(
  db: HubDb,
  userId: string,
  opts?: { label?: string; appDeviceId?: string },
): Promise<{ device_id: string; device_credential: string }> {
  const deviceId = randomId("dev");
  const deviceCredential = randomCredential();
  const credentialHash = await sha256Hex(deviceCredential);
  const now = new Date();
  await db.insert(devices).values({
    deviceId,
    userId,
    credentialHash,
    label: opts?.label ?? null,
    appDeviceId: opts?.appDeviceId ?? null,
    createdAt: now,
    lastSeenAt: now,
  });
  return { device_id: deviceId, device_credential: deviceCredential };
}

export async function listDevices(db: HubDb, userId: string) {
  return db.select().from(devices).where(eq(devices.userId, userId));
}

export async function rotateDevice(
  db: HubDb,
  userId: string,
  deviceId: string,
): Promise<{ device_credential: string } | null> {
  const rows = await db
    .select()
    .from(devices)
    .where(
      and(
        eq(devices.deviceId, deviceId),
        eq(devices.userId, userId),
        isNull(devices.revokedAt),
      ),
    )
    .limit(1);
  if (!rows[0]) return null;
  const deviceCredential = randomCredential();
  const credentialHash = await sha256Hex(deviceCredential);
  const now = new Date();
  await db
    .update(devices)
    .set({
      credentialHash,
      rotatedAt: now,
      lastSeenAt: now,
    })
    .where(eq(devices.deviceId, deviceId));
  return { device_credential: deviceCredential };
}

export async function revokeDevice(
  db: HubDb,
  userId: string,
  deviceId: string,
): Promise<boolean> {
  const now = new Date();
  await db
    .update(devices)
    .set({ revokedAt: now })
    .where(
      and(
        eq(devices.deviceId, deviceId),
        eq(devices.userId, userId),
        isNull(devices.revokedAt),
      ),
    );
  return true;
}

export async function verifyDeviceCredential(
  db: HubDb,
  credential: string,
): Promise<{ userId: string; deviceId: string } | null> {
  const hash = await sha256Hex(credential);
  const rows = await db
    .select()
    .from(devices)
    .where(and(eq(devices.credentialHash, hash), isNull(devices.revokedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await db
    .update(devices)
    .set({ lastSeenAt: new Date() })
    .where(eq(devices.deviceId, row.deviceId));
  return { userId: row.userId, deviceId: row.deviceId };
}
