export function resolveCommitDiffFocusFile(
  files: readonly { filename: string }[],
  focusPath: string | null | undefined,
): string | null {
  const wanted = focusPath?.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!wanted) return null;
  for (const file of files) {
    const name = file.filename.replace(/\\/g, "/");
    if (name === wanted) return file.filename;
  }
  for (const file of files) {
    const name = file.filename.replace(/\\/g, "/");
    if (name.endsWith(`/${wanted}`) || wanted.endsWith(`/${name}`)) {
      return file.filename;
    }
  }
  return null;
}
