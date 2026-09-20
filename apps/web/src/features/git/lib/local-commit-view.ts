import { gitApi } from "@/api/ws-api";
import type { PrFile } from "@/features/github/lib/github-query-options";
import { unifiedHunkBody } from "@/features/git/lib/unified-diff-from-sides";

export type LocalCommitView = {
  body: string | null;
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: PrFile[];
};

export async function loadLocalCommitView(
  repoPath: string,
  sha: string,
): Promise<LocalCommitView> {
  const [detail, changed] = await Promise.all([
    gitApi.getCommitDetail(repoPath, sha),
    gitApi.getChangedFiles(repoPath, null, false, { commitRef: sha }),
  ]);
  const listed = changed.staged_files;
  const paths = listed.map((file) => file.path);
  const diffs =
    paths.length > 0
      ? await gitApi.getFilesDiff(repoPath, paths, null, { commitRef: sha })
      : { results: [] };
  const diffByPath = new Map(
    diffs.results
      .filter((result) => result.diff)
      .map((result) => [result.file_path, result.diff!]),
  );
  const files: PrFile[] = listed.map((meta) => {
    const diff = diffByPath.get(meta.path);
    const patch =
      diff?.kind === "text"
        ? unifiedHunkBody(diff.old_text ?? "", diff.new_text ?? "")
        : undefined;
    return {
      sha: diff?.new_sha256 ?? "",
      filename: meta.path,
      status: meta.status,
      additions: meta.additions,
      deletions: meta.deletions,
      changes: meta.additions + meta.deletions,
      patch: patch || undefined,
      kind: diff?.kind ?? (meta.is_binary ? "binary" : "text"),
      preview_kind: diff?.preview_kind,
    };
  });
  return {
    body: detail.body,
    filesChanged: detail.files_changed,
    insertions: detail.insertions,
    deletions: detail.deletions,
    files,
  };
}