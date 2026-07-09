import type { NextRequest } from "next/server";
import { i18nMiddleware } from "@atmos/i18n/middleware";

type I18nMiddleware = (request: NextRequest) => ReturnType<typeof i18nMiddleware>;

/**
 * next-intl middleware is typed against whatever `next` instance resolved for
 * `@atmos/i18n`. Under a broken/ignored lockfile Vercel can install two Next
 * copies and `NextRequest` becomes nominally incompatible. Cast through a
 * shared function type so production builds stay resilient.
 */
export function proxy(request: NextRequest) {
  return (i18nMiddleware as I18nMiddleware)(request);
}

// Note: Next.js requires the config object to be statically analyzable at build time.
// We cannot import it from the shared package because the 'matcher' must be a literal
// or a constant defined in this file. Importing it causes build errors.
export const config = {
  // Match all pathnames except for
  // - API routes
  // - Static files (images, etc.)
  // - _next (Next.js internals)
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
