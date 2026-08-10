/**
 * Web re-export of Better Auth browser client for Atmos Hub.
 * Implementation: `@atmos/hub-client/auth/browser`.
 */
import "@/api/hub-bootstrap";

export {
  getHubAuthClient,
  hubGetSession,
  hubSignInSocial,
  hubSignOut,
  resetHubAuthClient,
  type HubSession,
} from "@atmos/hub-client/auth/browser";
