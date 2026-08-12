export const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

export const posthogHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export function isPostHogEnabled(): boolean {
  return Boolean(posthogKey);
}
