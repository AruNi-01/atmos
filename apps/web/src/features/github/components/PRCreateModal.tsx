import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
  Textarea,
  Label,
  DialogClose,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  ScrollArea,
} from "@workspace/ui";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  GitPullRequest,
  GitBranch,
  Loader2,
  X,
  Check,
  ChevronDown,
  Search as SearchIcon,
} from "lucide-react";
import { Github } from "@workspace/ui/components/icons/lucide-brand-icons";
import { cn } from "@/shared/lib/utils";
import { useGitStore } from "@/features/git/store/use-git-store";
import { useGitInfoStore } from "@/features/git/store/use-git-info-store";
import { gitApi } from "@/api/ws-api";

interface PRCreateModalProps {
  owner: string;
  repo: string;
  branch: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function PRCreateModal({
  owner,
  repo,
  branch,
  isOpen,
  onOpenChange,
  onCreated,
}: PRCreateModalProps) {
  const t = useTranslations("github.prCreateModal");
  const send = useWebSocketStore((s) => s.send);
  const currentRepoPath = useGitStore((s) => s.currentRepoPath);
  const targetBranch = useGitInfoStore((s) => s.targetBranch);

  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(t("defaultTitle", { branch }));
  const [body, setBody] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [isDraft, setIsDraft] = useState(false);

  // Branch selection state
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);

  // Reset form fields when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle(t("defaultTitle", { branch }));
      setBody("");
      setLoading(false);
    }
  }, [isOpen, branch, t]);

  // Fetch branches and set baseBranch
  useEffect(() => {
    if (isOpen && currentRepoPath) {
      setIsLoadingBranches(true);
      gitApi
        .listRemoteBranches(currentRepoPath)
        .then((branches) => {
          setAvailableBranches(branches.sort());
          if (targetBranch && branches.includes(targetBranch)) {
            setBaseBranch(targetBranch);
          } else if (branches.includes("main")) {
            setBaseBranch("main");
          } else if (branches.length > 0) {
            setBaseBranch(branches[0]);
          }
        })
        .catch((err) => console.error("Failed to fetch branches:", err))
        .finally(() => setIsLoadingBranches(false));
    }
  }, [isOpen, currentRepoPath, targetBranch]);

  const handleCreate = async () => {
    if (!title.trim()) return;

    setLoading(true);
    try {
      await send("github_pr_create", {
        owner,
        repo,
        branch,
        base_branch: baseBranch,
        title: title.trim(),
        body: body.trim(),
        draft: isDraft,
      });
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      console.error("Failed to create PR:", e);
    } finally {
      setLoading(false);
    }
  };

  const filteredBranches = availableBranches.filter((b) =>
    b.toLowerCase().includes(branchFilter.toLowerCase()),
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-full min-w-[820px] overflow-hidden border border-border/60 bg-background p-0 shadow-2xl"
      >
        <div className="relative flex h-full flex-col">
          {/* Close button in the dialog header */}
          <div className="absolute top-6 right-6 z-50">
            <DialogClose asChild>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md opacity-70 hover:bg-muted/80 hover:opacity-100"
                aria-label={t("actions.close")}
              >
                <X className="size-4" />
              </button>
            </DialogClose>
          </div>

          <DialogHeader className="relative flex shrink-0 flex-row items-center gap-4 space-y-0 border-b border-border/40 px-8 pt-8 pb-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
              <GitPullRequest className="size-5.5" />
            </div>
            <div className="flex flex-col gap-0.5 overflow-hidden">
              <div className="flex items-center gap-2.5">
                <DialogTitle className="text-lg font-bold tracking-tight">{t("title")}</DialogTitle>
                <span className="font-light text-muted-foreground/30 select-none">|</span>
                <div className="flex items-center gap-1.5 truncate text-xs font-medium text-muted-foreground/60">
                  <Github className="size-3.5" />
                  <span>
                    {owner}/{repo}
                  </span>
                </div>
              </div>
              <DialogDescription className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                {t.rich("description", {
                  branch,
                  baseBranch,
                  highlight: (chunks) => (
                    <span className="rounded bg-muted/50 px-1 font-mono text-foreground">
                      {chunks}
                    </span>
                  ),
                })}
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* Form Content */}
          <ScrollArea
            scrollFade
            className="h-auto max-h-[70vh] min-h-0 w-full"
            viewportClassName="max-h-[70vh] px-8 py-8"
          >
            <div className="space-y-8">
              {/* Title Field */}
              <div className="space-y-3">
                <Label
                  htmlFor="pr-title"
                  className="ml-0.5 flex items-center gap-2 text-[11px] font-bold tracking-widest text-muted-foreground/80 uppercase"
                >
                  {t("fields.title")}
                  <span className="text-red-500/80">*</span>
                </Label>
                <Input
                  id="pr-title"
                  placeholder={t("fields.titlePlaceholder")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-12 rounded-lg border-border/40 bg-muted/20 px-4 text-[14px] font-medium transition-all focus:bg-background focus:ring-1 focus:ring-primary/20"
                />
              </div>

              {/* Branches Selection */}
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-3">
                  <Label className="ml-0.5 text-[11px] font-bold tracking-widest text-muted-foreground/80 uppercase">
                    {t("fields.mergeFrom")}
                  </Label>
                  <div className="group flex h-12 items-center rounded-lg border border-border/30 bg-muted/10 px-4 font-mono text-xs text-muted-foreground/70 select-none">
                    <GitBranch className="mr-2.5 size-3.5 opacity-50" />
                    <span className="truncate">{branch}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="ml-0.5 text-[11px] font-bold tracking-widest text-muted-foreground/80 uppercase">
                    {t("fields.intoBase")}
                  </Label>

                  <DropdownMenu
                    open={isBranchDropdownOpen}
                    onOpenChange={(open) => {
                      setIsBranchDropdownOpen(open);
                      if (open) setBranchFilter("");
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <button className="group flex h-12 w-full cursor-pointer items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-4 font-mono text-xs text-foreground outline-none hover:border-border/60 hover:bg-muted/30">
                        <div className="flex min-w-0 items-center">
                          <GitBranch className="mr-2.5 size-3.5 text-primary/60 group-hover:text-primary" />
                          <span className="truncate">{baseBranch}</span>
                        </div>
                        <ChevronDown className="ml-2 size-4 shrink-0 opacity-40 transition-opacity group-hover:opacity-100" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-[280px] rounded-xl border border-border/50 bg-background/98 p-2 shadow-2xl backdrop-blur-md"
                    >
                      <div className="space-y-2 p-2">
                        <div className="relative">
                          <SearchIcon className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
                          <Input
                            value={branchFilter}
                            onChange={(e) => setBranchFilter(e.target.value)}
                            placeholder={t("fields.findBranch")}
                            className="h-9 border-none bg-muted/30 pl-9 text-[12px] focus-visible:ring-1 focus-visible:ring-primary/20"
                            autoFocus
                            onKeyDown={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      <ScrollArea scrollFade className="mt-1 h-[200px] overflow-x-hidden pr-1">
                        <div className="p-1">
                          {isLoadingBranches ? (
                            <div className="flex flex-col items-center gap-2 p-4 text-center text-[11px] text-muted-foreground">
                              <Loader2 className="size-4 animate-spin opacity-50" />
                              <span>{t("fields.loadingBranches")}</span>
                            </div>
                          ) : filteredBranches.length > 0 ? (
                            filteredBranches.map((b) => (
                              <DropdownMenuItem
                                key={b}
                                onClick={() => {
                                  setBaseBranch(b);
                                  setIsBranchDropdownOpen(false);
                                }}
                                className={cn(
                                  "mb-0.5 flex h-10 cursor-pointer items-center justify-between rounded-lg px-3 text-[12px]",
                                  baseBranch === b
                                    ? "bg-primary/10 font-bold text-primary"
                                    : "hover:bg-muted/50",
                                )}
                              >
                                <div className="mr-2 flex items-center truncate">
                                  <GitBranch
                                    className={cn(
                                      "mr-2.5 size-3.5 shrink-0",
                                      baseBranch === b
                                        ? "text-primary"
                                        : "text-muted-foreground/40",
                                    )}
                                  />
                                  <span className="truncate">{b}</span>
                                </div>
                                {baseBranch === b && <Check className="size-3.5 shrink-0" />}
                              </DropdownMenuItem>
                            ))
                          ) : (
                            <div className="p-4 text-center text-[11px] text-muted-foreground italic">
                              {t("fields.noBranchesFound")}
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Description Field */}
              <div className="space-y-3">
                <Label
                  htmlFor="pr-body"
                  className="ml-0.5 text-[11px] font-bold tracking-widest text-muted-foreground/80 uppercase"
                >
                  {t("fields.description")}
                </Label>
                <Textarea
                  id="pr-body"
                  placeholder={t("fields.descriptionPlaceholder")}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="no-scrollbar min-h-[180px] resize-none rounded-lg border-border/40 bg-muted/20 p-4 text-[14px] leading-relaxed shadow-inner transition-all focus:bg-background focus:ring-1 focus:ring-primary/20"
                />
              </div>

              {/* Draft Option */}
              <div
                className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-border/40 bg-sidebar/5 p-5 hover:bg-sidebar/10"
                onClick={() => setIsDraft(!isDraft)}
              >
                <div
                  className={cn(
                    "flex size-5 items-center justify-center rounded-md border-2 transition-all",
                    isDraft
                      ? "border-primary bg-primary"
                      : "border-border/60 group-hover:border-primary/40",
                  )}
                >
                  {isDraft && <Check className="size-3.5 stroke-[3px] text-primary-foreground" />}
                </div>
                <div className="pointer-events-none flex flex-col gap-0.5">
                  <span className="text-[13.5px] font-bold">{t("draft.title")}</span>
                  <span className="text-[11px] font-medium tracking-tight text-muted-foreground/70">
                    {t("draft.description")}
                  </span>
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-end gap-4 border-t border-border/40 bg-muted/10 px-8 py-6">
            <DialogClose asChild>
              <Button
                variant="ghost"
                className="h-11 rounded-xl px-6 text-xs font-bold opacity-70 hover:bg-muted hover:opacity-100"
              >
                {t("actions.cancel")}
              </Button>
            </DialogClose>
            <Button
              onClick={handleCreate}
              disabled={loading || !title.trim()}
              className="h-11 min-w-[150px] rounded-xl bg-primary px-10 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] hover:shadow-primary/30 active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t("actions.creating")}
                </>
              ) : (
                t("actions.createPullRequest")
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
