import { hubFetch } from "./http";
import type { HubDeviceEnrollResponse, HubDeviceRow } from "./types";

export async function hubListDevices(): Promise<HubDeviceRow[]> {
  const res = await hubFetch("/v1/devices");
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(`Hub devices ${res.status}`);
  const body = (await res.json()) as { devices?: HubDeviceRow[] };
  return body.devices ?? [];
}

export async function hubEnrollDevice(opts?: {
  label?: string;
  app_device_id?: string;
}): Promise<HubDeviceEnrollResponse> {
  const res = await hubFetch("/v1/devices", {
    method: "POST",
    body: JSON.stringify({
      label: opts?.label,
      app_device_id: opts?.app_device_id,
    }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json() as Promise<HubDeviceEnrollResponse>;
}
