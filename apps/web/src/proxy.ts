import type { NextRequest } from "next/server";
import { i18nMiddleware } from "@vibe-habitat/i18n/middleware";

export function proxy(request: NextRequest) {
  return i18nMiddleware(request);
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

