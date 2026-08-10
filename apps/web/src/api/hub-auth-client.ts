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
  hubListSessions,
  hubOAuthStartUrl,
  hubRevokeSession,
  hubSignInSocial,
  hubSignInSocialUrl,
  hubSignOut,
  hubUnlinkAccount,
  resetHubAuthClient,
  type HubAuthSessionRow,
  type HubLinkedAccount,
  type HubOAuthMode,
  type HubSession,
  type HubSocialProvider,
} from "@atmos/hub-client/auth/browser";
