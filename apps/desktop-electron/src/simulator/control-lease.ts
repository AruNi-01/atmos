export const CONTROL_PROTOCOL = "atmos-simulator/v1";

export type ControlLease = {
  protocol?: string;
  base_url: string;
  port?: number;
  token: string;
  pid?: number;
  instance_id?: string;
  updated_at?: string;
};

export function parseControlLease(raw: string): ControlLease | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return null;
    const row = parsed as Record<string, unknown>;
    if (typeof row.base_url !== "string" || !row.base_url) return null;
    if (typeof row.token !== "string" || !row.token) return null;
    const pid =
      typeof row.pid === "number" && Number.isFinite(row.pid) ? row.pid : undefined;
    const port =
      typeof row.port === "number" && Number.isFinite(row.port) ? row.port : undefined;
    return {
      protocol: typeof row.protocol === "string" ? row.protocol : undefined,
      base_url: row.base_url,
      port,
      token: row.token,
      pid,
      instance_id: typeof row.instance_id === "string" ? row.instance_id : undefined,
      updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
    };
  } catch {
    return null;
  }
}

export function isProcessAlive(pid: number | undefined | null): boolean {
  if (typeof pid !== "number" || !Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function leaseBelongsToProcess(
  lease: ControlLease | null,
  opts: { pid: number; instanceId: string },
): boolean {
  if (!lease) return false;
  if (lease.instance_id && lease.instance_id === opts.instanceId) return true;
  return typeof lease.pid === "number" && lease.pid === opts.pid;
}

export function shouldTakeOverLease(
  lease: ControlLease | null,
  opts: { isPidAlive: (pid: number) => boolean; healthOk: boolean },
): boolean {
  if (!lease) return true;
  if (typeof lease.pid !== "number" || !opts.isPidAlive(lease.pid)) return true;
  return !opts.healthOk;
}

export async function probeControlHealth(
  baseUrl: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 400;
  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/v1/health`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: unknown; protocol?: unknown };
    if (body?.ok !== true) return false;
    if (body.protocol !== undefined && body.protocol !== CONTROL_PROTOCOL) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
