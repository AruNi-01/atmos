import {
  AuthConnectContent,
  type AuthConnectContentProps,
} from "@/features/onboarding/AuthConnectContent";

export type LoginSheetProps = Omit<AuthConnectContentProps, "presentation">;

/**
 * Form-sheet presentation of the shared pair / OAuth connect UI.
 * Prefer this from routes opened as `presentation: "formSheet"`.
 */
export function LoginSheet(props: LoginSheetProps) {
  return <AuthConnectContent {...props} presentation="sheet" />;
}
