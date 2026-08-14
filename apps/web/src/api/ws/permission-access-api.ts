"use client";

import { wsRequest } from "@/api/ws/request";

export type PermissionAccessDecision =
  | "allow"
  | "skip_not_installed"
  | "skip_no_consent";

export interface PermissionAccessStatus {
  id: string;
  label: string;
  capability: string;
  detected: boolean;
  has_install_fingerprint: boolean;
  consent: boolean | null;
  decision: PermissionAccessDecision;
}

export const permissionAccessApi = {
  list: async (): Promise<{ resources: PermissionAccessStatus[] }> => {
    return wsRequest("permission_access_list", {});
  },
  setConsent: async (
    resourceId: string,
    granted: boolean,
  ): Promise<{ resources: PermissionAccessStatus[] }> => {
    return wsRequest("permission_access_set", {
      resource_id: resourceId,
      capability: "browser-cookie",
      granted,
    });
  },
};
