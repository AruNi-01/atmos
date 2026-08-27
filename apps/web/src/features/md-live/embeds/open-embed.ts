import { parseMdLiveGithubTarget, type MdLiveEmbedSpec } from "@atmos/md-live";
import { activateCenterChromeTab } from "@/app-shell/center-stage-activate";
import { useGithubCenterTabsStore } from "@/features/github/store/use-github-center-tabs";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { mdLiveCopy } from "../lib/md-live-copy";

function resolveContextId(): string | null {
  return useEditorStore.getState().currentWorkspaceId;
}

function openGithubNative(spec: MdLiveEmbedSpec): boolean {
  const target = parseMdLiveGithubTarget(spec);
  const contextId = resolveContextId();
  if (!target || !contextId) return false;
  const store = useGithubCenterTabsStore.getState();
  if (target.kind === "issue") {
    const tab = store.openIssue(contextId, {
      label: mdLiveCopy("githubIssue", { number: target.number }),
      owner: target.owner,
      repo: target.repo,
      issueNumber: target.number,
      description: spec.title || undefined,
    });
    activateCenterChromeTab(contextId, tab.value, { placement: "focused" });
    return true;
  }
  const tab = store.openPullRequest(contextId, {
    branch: "",
    label: mdLiveCopy("githubPullRequest", { number: target.number }),
    owner: target.owner,
    repo: target.repo,
    prNumber: target.number,
    description: spec.title || undefined,
  });
  activateCenterChromeTab(contextId, tab.value, { placement: "focused" });
  return true;
}

export function openMdLiveEmbed(spec: MdLiveEmbedSpec): void {
  if (openGithubNative(spec)) return;

  const path = spec.attrs.path;
  if (path) {
    const root = useEditorStore.getState().currentProjectPath;
    const full = path.startsWith("/")
      ? path
      : root
        ? `${root.replace(/\/+$/, "")}/${path}`
        : path;
    void useEditorStore.getState().openFile(full);
    return;
  }

  const url = spec.attrs.url;
  if (url && /^https?:\/\//.test(url)) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
