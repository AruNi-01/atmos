/** Shared Hub control-plane DTOs (wire shapes). */

export type HubMe = {
  user_id: string;
  email?: string | null;
  name?: string | null;
  handle?: string | null;
};

export type HubDeviceRow = {
  device_id: string;
  label: string | null;
  created_at?: unknown;
  last_seen_at?: unknown;
  rotated_at?: unknown;
  revoked_at?: unknown;
};

export type HubDeviceEnrollResponse = {
  device_id: string;
  device_credential: string;
  relay_synced?: boolean;
};

export type HubLinearStatus = {
  connected: boolean;
  auth_method?: string;
  viewer_name?: string | null;
  viewer_email?: string | null;
};

export type StoredDeviceCredential = {
  device_id: string;
  device_credential: string;
  enrolled_at: number;
};

export type {
  HubAuthMaterial,
  HubAuthWire,
} from "./auth-material";
