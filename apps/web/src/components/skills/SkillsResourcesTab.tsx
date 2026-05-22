import { Button, TabsContent } from "@workspace/ui";
import { motion } from "motion/react";
import { BookOpen, ExternalLink, Link2 } from "lucide-react";
import type { SkillResourceCategory } from "./market-data";
import { EmptyState } from "./SkillsViewEmptyState";
import { RESOURCES_EMPTY_COPY } from "./skills-view-utils";

export function SkillsResourcesTab({
  categories,
  resultCount,
  query,
  onClearSearch,
}: {
  categories: SkillResourceCategory[];
  resultCount: number;
  query: string;
  onClearSearch: () => void;
}) {
  return (
    <TabsContent keepMounted value="resources">
      {resultCount === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-8" />}
          title="No resources matched"
          description={RESOURCES_EMPTY_COPY}
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
            <section key={category.id} className="space-y-4">
              <div className="flex items-end justify-between gap-4 border-b border-border/60 pb-3">
                <div>
                  <h3 className="text-sm font-semibold tracking-wide text-foreground">{category.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {category.items.length} resource{category.items.length > 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {category.items.map((item, index) => (
                  <motion.a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.16) }}
                    className="group flex h-full flex-col rounded-xl border border-border p-5 transition-all duration-200 hover:bg-muted/25 hover:shadow-md"
                  >
                    <div className="flex flex-1 flex-col justify-between">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex items-start gap-3">
                          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/20 text-primary transition-colors group-hover:bg-primary/5">
                            <Link2 className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-semibold tracking-tight text-foreground">{item.title}</h4>
                            <p className="mt-1 text-xs text-muted-foreground">{category.title}</p>
                          </div>
                        </div>
                        <ExternalLink className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                      </div>

                      <p className="mt-4 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground text-pretty">
                        {item.description}
                      </p>
                    </div>
                  </motion.a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </TabsContent>
  );
}
