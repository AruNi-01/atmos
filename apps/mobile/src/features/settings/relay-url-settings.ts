import { normalizeRelayUrl } from "@/lib/relay-url";

export type RelayUrlSaveState = {
  canSave: boolean;
  normalizedUrl: string;
  reason: string | null;
};

function isValidRelayUrlDraft(trimmed: string): boolean {
  if (!trimmed) {
    return true;
  }

  const explicitScheme = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (explicitScheme) {
    const scheme = explicitScheme[1].toLowerCase();
    if (scheme !== "http" && scheme !== "https") {
      return false;
    }
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
}

export function getRelayUrlSaveState({
  currentUrl,
  draftUrl,
}: {
  currentUrl: string;
  draftUrl: string;
}): RelayUrlSaveState {
  const normalizedCurrent = normalizeRelayUrl(currentUrl);
  const trimmedDraft = draftUrl.trim();

  if (trimmedDraft && !isValidRelayUrlDraft(trimmedDraft)) {
    return {
      canSave: false,
      normalizedUrl: normalizeRelayUrl(draftUrl),
      reason: "Enter a valid Relay URL.",
    };
  }

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
