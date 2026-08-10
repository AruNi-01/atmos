/**
 * Desktop Use readiness — async doctor check + localStorage cache.
 *
 * Entry points (AppShot, slash Desktop Use, …) call
 * {@link checkDesktopUseReadinessInBackground} so the UI never blocks on IPC.
 */

import { desktopInvoke, isDesktopRuntime } from "@/shared/lib/desktop-bridge";

export type DesktopUseReadinessReason =
  | "web_only"
  | "cli_not_installed"
  | "cli_update_required"
  | "engine_not_installed"
  | "engine_not_running"
  | "permission_accessibility"
  | "permission_screen_recording"
  | "permission_both"
  | "unknown";

export type DesktopUseReadiness = {
  ready: boolean;
  reason: DesktopUseReadinessReason | null;
  cliInstalled: boolean;
  engineInstalled: boolean;
  engineReady: boolean;
  accessibility: boolean | null;
  screenRecording: boolean | null;
  checkedAt: number;
  fromCache: boolean;
};

type DoctorPayload = {
  engine_installed?: boolean;
  engine_ready?: boolean;
  accessibility?: boolean | null;
  screen_recording?: boolean | null;
  cli_installed?: boolean;
  cli_meets_requirement?: boolean;
  notes?: string[];
};

/** Bumped when readiness shape changes (e.g. cliInstalled). */
const CACHE_KEY = "atmos:v2:desktop-use:readiness";
/** Positive (ready) cache TTL. */
const READY_TTL_MS = 5 * 60 * 1000;
/** Negative cache TTL — short so fixing permissions is picked up quickly. */
const NOT_READY_TTL_MS = 45 * 1000;

type CacheRecord = Omit<DesktopUseReadiness, "fromCache">;

let memoryCache: CacheRecord | null = null;
let inflight: Promise<DesktopUseReadiness> | null = null;

function now(): number {
  return Date.now();
}

function readStorage(): CacheRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheRecord;
    if (
      typeof parsed?.checkedAt !== "number" ||
      typeof parsed?.ready !== "boolean"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(record: CacheRecord): void {
  memoryCache = record;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(record));
  } catch {
    /* quota / private mode */
  }
}

function isFresh(record: CacheRecord, at = now()): boolean {
  const age = at - record.checkedAt;
  if (age < 0) return false;
  return age <= (record.ready ? READY_TTL_MS : NOT_READY_TTL_MS);
}

function derive(
  doctor: DoctorPayload,
  checkedAt: number,
  fromCache: boolean,
): DesktopUseReadiness {
  const notes = Array.isArray(doctor.notes) ? doctor.notes : [];
  const cliInstalled =
    doctor.cli_installed !== false && !notes.includes("cli_not_installed");
  const cliMeetsRequirement =
    cliInstalled &&
    doctor.cli_meets_requirement !== false &&
    !notes.includes("cli_update_required");
  const engineInstalled = Boolean(doctor.engine_installed);
  const engineReady = Boolean(doctor.engine_ready);
  const accessibility =
    typeof doctor.accessibility === "boolean" ? doctor.accessibility : null;
  const screenRecording =
    typeof doctor.screen_recording === "boolean"
      ? doctor.screen_recording
      : null;

  let reason: DesktopUseReadinessReason | null = null;
  if (!cliInstalled) {
    reason = "cli_not_installed";
  } else if (!cliMeetsRequirement) {
    reason = "cli_update_required";
  } else if (!engineInstalled) {
    reason = "engine_not_installed";
  } else if (!engineReady) {
    reason = "engine_not_running";
  } else {
    const axOk = accessibility !== false;
    const scrOk = screenRecording !== false;
    if (!axOk && !scrOk) reason = "permission_both";
    else if (!axOk) reason = "permission_accessibility";
    else if (!scrOk) reason = "permission_screen_recording";
  }

  // Treat null permission as unknown-but-allow when engine ready (doctor may
  // not always probe). Only explicit false blocks.
  const ready = reason === null;

  return {
    ready,
    reason,
    cliInstalled,
    engineInstalled,
    engineReady,
    accessibility,
    screenRecording,
    checkedAt,
    fromCache,
  };
}

function toCacheRecord(r: DesktopUseReadiness): CacheRecord {
  const { fromCache: _fc, ...rest } = r;
  return rest;
}

/** Invalidate cache (e.g. after install / uninstall / grant in Settings). */
export function invalidateDesktopUseReadinessCache(): void {
  memoryCache = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** Sync peek: memory → localStorage if still fresh. */
export function peekDesktopUseReadinessCache(): DesktopUseReadiness | null {
  const rec = memoryCache ?? readStorage();
  if (!rec) return null;
  memoryCache = rec;
  if (!isFresh(rec)) return { ...rec, fromCache: true };
  return { ...rec, fromCache: true };
}

/**
 * Fetch doctor (or use fresh cache). Concurrent callers share one in-flight request.
 */
export async function fetchDesktopUseReadiness(opts?: {
  force?: boolean;
}): Promise<DesktopUseReadiness> {
  if (!isDesktopRuntime()) {
    return {
      ready: false,
      reason: "web_only",
      cliInstalled: false,
      engineInstalled: false,
      engineReady: false,
      accessibility: null,
      screenRecording: null,
      checkedAt: now(),
      fromCache: false,
    };
  }

  if (!opts?.force) {
    const cached = peekDesktopUseReadinessCache();
    if (cached && isFresh(toCacheRecord(cached))) {
      return cached;
    }
  }

  if (inflight && !opts?.force) {
    return inflight;
  }

  inflight = (async () => {
    try {
      // Canonical CLI first (ADR-005) — doctor needs ~/.atmos/bin/atmos.
      try {
        const probe = await desktopInvoke<{
          installed?: boolean;
          meets_requirement?: boolean;
          update_required?: boolean;
        }>("atmos_cli_probe");
        if (probe && probe.installed === false) {
          const blocked: DesktopUseReadiness = {
            ready: false,
            reason: "cli_not_installed",
            cliInstalled: false,
            engineInstalled: false,
            engineReady: false,
            accessibility: null,
            screenRecording: null,
            checkedAt: now(),
            fromCache: false,
          };
          writeStorage(toCacheRecord(blocked));
          return blocked;
        }
        if (
          probe &&
          probe.installed === true &&
          (probe.update_required === true || probe.meets_requirement === false)
        ) {
          const blocked: DesktopUseReadiness = {
            ready: false,
            reason: "cli_update_required",
            cliInstalled: true,
            engineInstalled: false,
            engineReady: false,
            accessibility: null,
            screenRecording: null,
            checkedAt: now(),
            fromCache: false,
          };
          writeStorage(toCacheRecord(blocked));
          return blocked;
        }
      } catch {
        /* probe optional; doctor soft-status may still report cli_* codes */
      }

      const doctor = await desktopInvoke<DoctorPayload>("desktop_use_doctor");
      const result = derive(doctor ?? {}, now(), false);
      writeStorage(toCacheRecord(result));
      return result;
    } catch {
      const fallback = derive(
        {
          engine_installed: false,
          engine_ready: false,
          cli_installed: false,
          notes: ["cli_not_installed"],
        },
        now(),
        false,
      );
      // Soft-fail: if we had a ready cache, keep using it briefly on transient error
      const prev = memoryCache ?? readStorage();
      if (prev?.ready && now() - prev.checkedAt < READY_TTL_MS) {
        return { ...prev, fromCache: true };
      }
      writeStorage(toCacheRecord({ ...fallback, reason: "unknown" }));
      return { ...fallback, reason: "unknown", fromCache: false };
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Non-blocking gate for feature entry points.
 *
 * - Fresh **ready** cache → call `onReady` immediately; soft-refresh in background.
 * - Fresh **not-ready** cache → call `onBlocked` immediately; soft-refresh may update.
 * - No / stale cache → refresh in background only; `onBlocked`/`onReady` when result lands.
 * Never awaits from the caller's perspective.
 */
export function checkDesktopUseReadinessInBackground(handlers: {
  onReady?: (r: DesktopUseReadiness) => void;
  onBlocked?: (r: DesktopUseReadiness) => void;
}): void {
  const emit = (r: DesktopUseReadiness) => {
    if (r.ready) handlers.onReady?.(r);
    else handlers.onBlocked?.(r);
  };

  const cached = peekDesktopUseReadinessCache();
  if (cached && isFresh(toCacheRecord(cached))) {
    emit(cached);
    // Background soft refresh without forcing UI if still same readiness class
    void fetchDesktopUseReadiness({ force: true }).then((fresh) => {
      if (fresh.ready !== cached.ready) emit(fresh);
    });
    return;
  }

  void fetchDesktopUseReadiness({ force: true }).then(emit);
}
