import Link from "next/link";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  TabsContent,
} from "@workspace/ui";
import { motion } from "motion/react";
import {
  ArrowDownToLine,
  ChevronRight,
  ExternalLink,
  Puzzle,
  Store,
} from "lucide-react";
import {
  resolveSkillSourceUrl,
  type SkillMarketCategory,
  type SkillMarketItem,
} from "./market-data";
import { EmptyState } from "./SkillsViewEmptyState";
import { MARKET_EMPTY_COPY } from "./skills-view-utils";

export function SkillsMarketTab({
  categories,
  resultCount,
  query,
  collapsedCategories,
  onCategoryOpenChange,
  onClearSearch,
  onInstallSkill,
}: {
  categories: SkillMarketCategory[];
  resultCount: number;
  query: string;
  collapsedCategories: Record<string, boolean>;
  onCategoryOpenChange: (categoryId: string, open: boolean) => void;
  onClearSearch: () => void;
  onInstallSkill: (item: SkillMarketItem) => void;
}) {
  return (
    <TabsContent keepMounted value="market">
      {resultCount === 0 ? (
        <EmptyState
          icon={<Store className="size-8" />}
          title="No market skills matched"
          description={MARKET_EMPTY_COPY}
          action={
            query ? (
              <Button variant="link" onClick={onClearSearch} className="mt-4">
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-8">
          {categories.map((category) => (
            <Collapsible
              key={category.id}
              open={!(collapsedCategories[category.id] ?? false)}
              onOpenChange={(open) => onCategoryOpenChange(category.id, open)}
              className="rounded-2xl border border-border/70 bg-background/40"
            >
              <CollapsibleTrigger className="group flex w-full items-end justify-between gap-4 px-5 py-4 text-left cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ChevronRight className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold tracking-wide text-foreground">{category.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {category.items.length} skill{category.items.length > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t border-border/60 px-5 pb-5 pt-4">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {category.items.map((item, index) => (
                      <motion.div
                        key={item.id}
                        initial={false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.16) }}
                        className="group flex h-full flex-col rounded-xl border border-border p-5 transition-all duration-200 hover:bg-muted/25 hover:shadow-md"
                      >
                        <div className="flex flex-1 flex-col">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex items-start gap-3">
                              <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/20 text-primary transition-colors group-hover:bg-primary/5">
                                <Puzzle className="size-5" />
                              </div>
                              <div className="min-w-0">
                                <h4 className="truncate text-sm font-semibold tracking-tight text-foreground">{item.title}</h4>
                                {item.author && (
                                  <a
                                    href={item.author.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 inline-flex text-xs text-muted-foreground transition-colors hover:text-foreground"
                                  >
                                    {item.author.handle}
                                  </a>
                                )}
                              </div>
                            </div>
                            <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-primary">
                              Market
                            </span>
                          </div>

                          <p className="mt-4 flex-1 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground text-pretty">
                            {item.description}
                          </p>

                          <div className="mt-4 flex items-center justify-between gap-3">
                            <button
                              onClick={() => window.open(resolveSkillSourceUrl(item), "_blank", "noopener,noreferrer")}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground cursor-pointer"
                            >
                              <ExternalLink className="size-3.5" />
                              View Source
                            </button>
                            <button
                              onClick={() => onInstallSkill(item)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
                            >
                              <ArrowDownToLine className="size-3.5" />
                              Install
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}

          <div className="pt-2 text-center text-xs text-muted-foreground/60">
            Power By{" "}
            <Link
              href="https://github.com/ComposioHQ/awesome-claude-skills"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Awesome Claude Skills
            </Link>{" "}
            &{" "}
            <Link
              href="https://skills.sh"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              skills.sh
            </Link>
            .
          </div>
        </div>
      )}
    </TabsContent>
  );
}
