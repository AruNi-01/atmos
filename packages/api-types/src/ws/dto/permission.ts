export type PermissionAccessDecision =
  | "allow"
  | "skip_not_installed"
  | "skip_no_consent";

export type PermissionAccessStatus = {
  id: string;
  label: string;
  capability: string;
  detected: boolean;
  has_install_fingerprint: boolean;
  consent: boolean | null;
  decision: PermissionAccessDecision;
};

export type PermissionAccessListResponse = {
  resources: PermissionAccessStatus[];
};

export type PermissionAccessSetRequest = {
  resource_id: string;
  capability?: string | null;
  granted: boolean;
};
