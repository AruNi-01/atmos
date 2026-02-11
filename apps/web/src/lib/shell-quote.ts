/**
 * Quote a string for safe use in shell commands.
 * Uses single quotes to prevent all shell expansion ($, `, !, etc.).
 * Only single quotes within the string need escaping.
 */
export function shellQuote(str: string): string {
  if (!str) return "''";
  // Simple safe chars — no quoting needed
  if (/^[a-zA-Z0-9/_.\-+=:,@]+$/.test(str)) return str;
  // Single-quote the string; escape embedded single quotes as '\''
  return "'" + str.replace(/'/g, "'\\''") + "'";
}
