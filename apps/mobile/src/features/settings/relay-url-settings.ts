import { normalizeRelayUrl } from "@/lib/relay-url";

export type RelayUrlSaveState = {
  canSave: boolean;
  normalizedUrl: string;
  reason: string | null;
};

export function getRelayUrlSaveState({
  currentUrl,
  draftUrl,
}: {
  currentUrl: string;
  draftUrl: string;
}): RelayUrlSaveState {
  const normalizedCurrent = normalizeRelayUrl(currentUrl);
  const normalizedDraft = normalizeRelayUrl(draftUrl);

  if (normalizedDraft === normalizedCurrent) {
    return {
      canSave: false,
      normalizedUrl: normalizedDraft,
      reason: "Relay URL is already saved.",
    };
  }

  return {
    canSave: true,
    normalizedUrl: normalizedDraft,
    reason: null,
  };
}
