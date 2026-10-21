export type SessionInboxSurface = "home" | "bucket";

/** Candidate, git, PR, and chat-title fan-out stays on the home screen. */
export function sessionInboxLoadsEnrichment(surface: SessionInboxSurface): boolean {
  return surface === "home";
}

/** Focus invalidation stays on the home screen. A bucket push must not start it. */
export function sessionInboxRefreshesOnFocus(surface: SessionInboxSurface): boolean {
  return surface === "home";
}
