"use client";

import { createRef, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowLeftIcon,
  List,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "@atmos/i18n/navigation";
import { CTA1 } from "@workspace/ui/components/cta-1";
import {
  GithubIcon,
  type GithubIconHandle,
} from "@workspace/ui/components/icons/github-icon";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/ui/accordion";
import { Button } from "@workspace/ui/components/ui/button";
import { Badge } from "@workspace/ui/components/ui/badge";
import { BlinkingGrid } from "@/components/ui/blinking-grid";
import { changelogData } from "@/lib/changelog-data";
import { cn, formatDate } from "@/lib/utils";

const sectionBadgeClasses = {
  features:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  improvements:
    "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  fixes:
    "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300",
  others:
    "bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
} as const;

export default function ChangelogPage() {
  const t = useTranslations();
  const locale = useLocale();
  const language = locale === "zh" ? "zh" : "en";
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isDesktopTocCollapsed, setIsDesktopTocCollapsed] = useState(false);
  const githubIconRef = useRef<GithubIconHandle>(null);
  const releaseGithubIconRefs = useRef(
    changelogData.map(() => createRef<GithubIconHandle>())
  );

  useEffect(() => {
    const scrollToHash = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        setActiveId(hash);
        setIsScrolling(true);

        setTimeout(() => {
          const element = document.getElementById(hash);
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "start" });
          }

          setTimeout(() => setIsScrolling(false), 500);
        }, 100);
      }
    };

    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);

    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrolling) return;

        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    changelogData.forEach((item) => {
      if (!item.version) return;

      const element = document.getElementById(`v${item.version}`);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [isScrolling]);

  const handleTocClick = (version: string) => {
    const id = `v${version}`;
    setActiveId(id);
    setIsScrolling(true);
    window.history.pushState(null, "", `#${id}`);

    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    setTimeout(() => setIsScrolling(false), 500);
    setIsTocOpen(false);
  };

  const gridPaneClass =
    "m-6 w-full shrink-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px] max-xl:hidden";

  return (
    <div className="relative min-h-screen pt-0">
      <button
        onClick={() => setIsTocOpen(!isTocOpen)}
        className="fixed right-4 bottom-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg xl:hidden"
      >
        <List className="h-5 w-5" />
      </button>

      {isTocOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setIsTocOpen(false)}
          />
          <div className="absolute top-0 right-0 bottom-0 w-72 overflow-y-auto border-l border-border bg-background p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <List className="h-4 w-4" />
              {t("changelog.toc")}
            </h4>
            <nav className="space-y-1">
              {changelogData.map((item) => (
                <button
                  key={item.id}
                  onClick={() => item.version && handleTocClick(item.version)}
                  className={cn(
                    "w-full rounded-md px-2 py-2 text-left text-sm transition-colors",
                    "hover:bg-muted/50",
                    activeId === `v${item.version}`
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground"
                  )}
                >
                  <span className="mr-2 font-mono text-xs">v{item.version}</span>
                  <span className="line-clamp-1">{item.title[language]}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      <section className="relative overflow-hidden xl:flex">
        <BlinkingGrid className={gridPaneClass} />
        <div className="mx-auto w-full max-w-6xl shrink-0 min-[1158px]:border-x">
          <div className="">
            <CTA1
              title={t("changelog.heroTitle")}
              desc={t("changelog.heroDescription")}
              widthClassName="max-w-full"
              showFrame={false}
              showBorder={false}
              className="py-6 md:py-8"
              actionButtonOne={
                <Button variant="outline" asChild>
                  <Link href="/">
                    <ArrowLeftIcon />
                    {t("changelog.back")}
                  </Link>
                </Button>
              }
              actionButtonTwo={
                <Button asChild>
                  <a
                    href="https://github.com/AruNi-01/atmos/releases"
                    target="_blank"
                    rel="noreferrer"
                    onMouseEnter={() => githubIconRef.current?.startAnimation()}
                    onMouseLeave={() => githubIconRef.current?.stopAnimation()}
                    onFocus={() => githubIconRef.current?.startAnimation()}
                    onBlur={() => githubIconRef.current?.stopAnimation()}
                  >
                    {t("changelog.viewOnGitHub")}
                    <GithubIcon
                      ref={githubIconRef}
                      className="text-current"
                      size={18}
                    />
                  </a>
                </Button>
              }
            />
          </div>
        </div>
        <BlinkingGrid className={gridPaneClass} />
      </section>

      <section className="relative border-t">
        <div className="pointer-events-none absolute inset-0 z-40 hidden xl:block">
          <div className="mx-auto h-full w-full max-w-6xl">
            <div className="sticky top-20 flex justify-end">
              <aside className="pointer-events-auto relative w-64 translate-x-[calc(100%+0.75rem)]">
                <div
                  className={cn(
                    "absolute top-4 right-4 transition-all duration-300 ease-out",
                    isDesktopTocCollapsed
                      ? "translate-x-0 opacity-100"
                      : "translate-x-4 opacity-0 pointer-events-none"
                  )}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setIsDesktopTocCollapsed(false)}
                    className="cursor-pointer rounded-sm bg-background/90 shadow-xl backdrop-blur-sm hover:bg-muted/60"
                    aria-label={t("changelog.toc")}
                    title={t("changelog.toc")}
                  >
                    <PanelRightOpen className="h-4 w-4" />
                  </Button>
                </div>

                <div
                  className={cn(
                    "w-64 rounded-2xl bg-background/90 p-4 shadow-xl backdrop-blur-sm transition-all duration-300 ease-out",
                    isDesktopTocCollapsed
                      ? "translate-x-8 opacity-0 pointer-events-none"
                      : "translate-x-0 opacity-100"
                  )}
                >
                  <div className="flex items-center justify-between pb-3">
                    <h4 className="flex items-center gap-2 text-left text-sm font-semibold text-foreground">
                      <List className="h-4 w-4" />
                      {t("changelog.toc")}
                    </h4>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setIsDesktopTocCollapsed(true)}
                      className="cursor-pointer rounded-sm hover:bg-muted/60"
                      aria-label={t("changelog.toc")}
                      title={t("changelog.toc")}
                    >
                      <PanelRightClose className="h-4 w-4" />
                    </Button>
                  </div>

                  <nav className="space-y-1">
                    {changelogData.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => item.version && handleTocClick(item.version)}
                        className={cn(
                          "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                          "hover:bg-muted/50",
                          activeId === `v${item.version}`
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-muted-foreground"
                        )}
                      >
                        <span className="mr-2 font-mono text-xs">
                          v{item.version}
                        </span>
                        <span className="line-clamp-1">{item.title[language]}</span>
                      </button>
                    ))}
                  </nav>
                </div>
              </aside>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-6xl min-[1158px]:border-x">
          <div className="px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
            <div className="mx-auto min-w-0 max-w-4xl pr-2">
              <div className="relative">
                {changelogData.map((item, itemIndex) => {
              const date = new Date(item.date);
              const formattedDate = formatDate(date, language);
              const versionId = item.version ? `v${item.version}` : undefined;
              const sections = [
                {
                  key: "features",
                  label: t("changelog.features"),
                  items: item.content[language].features,
                },
                {
                  key: "improvements",
                  label: t("changelog.improvements"),
                  items: item.content[language].improvements,
                },
                {
                  key: "fixes",
                  label: t("changelog.fixes"),
                  items: item.content[language].fixes,
                },
                {
                  key: "others",
                  label: t("changelog.others"),
                  items: item.content[language].others,
                },
              ] as const;

                  return (
                    <div
                      key={item.id}
                      id={versionId}
                      className="relative scroll-mt-20"
                    >
                      <div className="flex flex-col gap-y-6 md:flex-row">
                        <div className="shrink-0 md:w-40">
                          <div className="pb-10 md:sticky md:top-26">
                            <time className="mb-3 block text-sm font-medium text-muted-foreground">
                              {formattedDate}
                            </time>

                            {item.version && (
                              <Link
                                href={`#${versionId}`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleTocClick(item.version!);
                                }}
                                className="relative z-10 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700/90 bg-zinc-900 text-sm font-bold text-foreground transition-colors hover:border-primary hover:text-primary"
                                title={t("changelog.copyLink")}
                              >
                                {item.version}
                              </Link>
                            )}
                          </div>
                        </div>

                        <div className="relative flex-1 pb-10 md:pl-8">
                          <div className="absolute top-2 left-0 hidden h-full w-px bg-zinc-700/90 md:block" />
                          <div className="absolute top-0 bottom-0 left-0 hidden md:block">
                            <div className="sticky top-[6.75rem] -translate-x-1/2">
                              <div className="size-3 rounded-full bg-primary" />
                            </div>
                          </div>

                          <div className="space-y-6">
                            <div className="relative z-10 flex flex-col gap-2">
                              <div className="flex items-start gap-2">
                                <h2 className="text-balance text-2xl font-semibold tracking-tight">
                                  {item.title[language]}
                                </h2>

                                {item.releaseUrl && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    asChild
                                    className="mt-0.5 shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
                                  >
                                    <a
                                      href={item.releaseUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      aria-label={t("changelog.viewOnGitHub")}
                                      title={t("changelog.viewOnGitHub")}
                                      onMouseEnter={() =>
                                        releaseGithubIconRefs.current[
                                          itemIndex
                                        ]?.current?.startAnimation()
                                      }
                                      onMouseLeave={() =>
                                        releaseGithubIconRefs.current[
                                          itemIndex
                                        ]?.current?.stopAnimation()
                                      }
                                      onFocus={() =>
                                        releaseGithubIconRefs.current[
                                          itemIndex
                                        ]?.current?.startAnimation()
                                      }
                                      onBlur={() =>
                                        releaseGithubIconRefs.current[
                                          itemIndex
                                        ]?.current?.stopAnimation()
                                      }
                                    >
                                      <GithubIcon
                                        ref={
                                          releaseGithubIconRefs.current[itemIndex]
                                        }
                                        className="text-current"
                                        size={14}
                                      />
                                    </a>
                                  </Button>
                                )}
                              </div>

                              {item.tags && item.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {item.tags.map((tag, index) => (
                                    <span
                                      key={index}
                                      className="flex h-6 w-fit items-center justify-center rounded-full border bg-muted px-2 text-xs font-medium text-muted-foreground"
                                    >
                                      {tag[language]}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {item.image && (
                              <div className="relative h-96 w-full overflow-hidden rounded-lg border bg-muted">
                                <Image
                                  src={item.image}
                                  alt={item.title[language]}
                                  fill
                                  className="object-cover"
                                  loading="lazy"
                                  unoptimized
                                />
                              </div>
                            )}

                            <div className="prose prose-sm max-w-none text-muted-foreground prose-p:my-0 prose-a:text-primary prose-a:underline dark:prose-invert [&_a]:underline">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {item.description[language]}
                              </ReactMarkdown>
                            </div>

                            <Accordion type="multiple" className="w-full">
                              {sections.map(
                                (section) =>
                                  section.items &&
                                  section.items.length > 0 && (
                                    <AccordionItem value={section.key} key={section.key}>
                                      <AccordionTrigger className="cursor-pointer hover:no-underline">
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            "rounded-md border-0 px-2.5 py-1 text-xs font-semibold shadow-none",
                                            sectionBadgeClasses[section.key]
                                          )}
                                        >
                                          {section.label}
                                        </Badge>
                                      </AccordionTrigger>
                                      <AccordionContent>
                                        <ul className="list-disc space-y-2 pl-4">
                                          {section.items.map((entry, index) => (
                                            <li
                                              key={index}
                                              className="prose prose-sm max-w-none prose-p:my-0 prose-a:text-primary prose-a:underline prose-strong:text-foreground dark:prose-invert [&_a]:underline"
                                            >
                                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {entry}
                                              </ReactMarkdown>
                                            </li>
                                          ))}
                                        </ul>
                                      </AccordionContent>
                                    </AccordionItem>
                                  )
                              )}
                            </Accordion>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
