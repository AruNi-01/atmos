/** Parse `lsof -nP -iTCP -p <pid>` and require every LISTEN address to be loopback. */
export function listenersAreLoopback(lsofOutput: string): boolean {
  const lines = lsofOutput.split("\n").filter((line) => /LISTEN/i.test(line));
  if (lines.length === 0) return true;
  return lines.every((line) => {
    if (/\*:/.test(line) || /0\.0\.0\.0:/.test(line) || /\[::\]:/.test(line)) {
      return false;
    }
    return /127\.0\.0\.1:|\[::1\]:/.test(line);
  });
}
