/**
 * Quote a string for safe use in shell commands.
 * Escapes double quotes and backslashes for cross-platform compatibility.
 */
export function shellQuote(str: string): string {
  if (!str) return '""';
  // Simple safe chars - no quoting needed
  if (/^[a-zA-Z0-9/_.-]+$/.test(str)) return str;
  return '"' + str.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}
