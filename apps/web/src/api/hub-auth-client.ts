/**
 * Web re-export of Better Auth browser client for Atmos Hub.
 * Implementation: `@atmos/hub-client/auth/browser`.
 */
import "@/api/hub-bootstrap";

export {
  getHubAuthClient,
  hubCreateLinkTicket,
  hubDeleteAccount,
  hubGetSession,
  hubListAccounts,
  hubOAuthStartUrl,
  hubSignInSocial,
  hubSignInSocialUrl,
  hubSignOut,
  hubUnlinkAccount,
  resetHubAuthClient,
  type HubLinkedAccount,
  type HubOAuthMode,
  type HubSession,
  type HubSocialProvider,
} from "@atmos/hub-client/auth/browser";
