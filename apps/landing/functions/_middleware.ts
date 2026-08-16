import { handleLandingRequest } from "./_lib/tok-app-proxy";

export function onRequest(context: Parameters<typeof handleLandingRequest>[0]) {
  return handleLandingRequest(context);
}
