export function isPlausibleAccessToken(token: string) {
  return token.trim().length >= 32;
}
