/**
 * Quote a string for safe use in shell commands.
 * Uses single quotes to prevent all shell expansion ($, `, !, etc.).
 * Only single quotes within the string need escaping.
 *
 * Strings containing newlines use ANSI-C quoting ($'...') so the resulting
 * command stays on a single line. Multiline commands typed into a PTY are
 * fragile: each raw newline is treated as Enter by the shell unless wrapped
 * in bracketed paste, which interactive TUIs may not honor mid-launch.
 */
export function shellQuote(str: string): string {
  if (!str) return "''";
  // Simple safe chars — no quoting needed
  if (/^[a-zA-Z0-9/_.\-+=:,@]+$/.test(str)) return str;
  if (/[\r\n]/.test(str)) {
    // ANSI-C quoting (zsh/bash): encode newlines as literal \n so the
    // command itself remains single-line; the shell expands them back.
    const escaped = str
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\r\n/g, "\\n")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
    return `$'${escaped}'`;
  }
  // Single-quote the string; escape embedded single quotes as '\''
  return "'" + str.replace(/'/g, "'\\''") + "'";
}
