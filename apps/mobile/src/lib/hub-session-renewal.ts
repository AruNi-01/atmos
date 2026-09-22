import type { HubMe } from "@atmos/hub-client";

/** What to do after one renewal attempt. Network failure must not sign the user out. */
export function hubSessionRenewalAction(result: HubMe | null, failed: boolean) {
  if (failed) return "keep" as const;
  if (result?.user_id) return "save" as const;
  return "expire" as const;
}
