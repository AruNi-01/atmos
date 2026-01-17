"use client";

import { useTranslations } from "next-intl";
import { Button } from "@workspace/ui/components/ui/button";
import { ArrowRight, Github } from "lucide-react";

export function HeroSection() {
  const t = useTranslations("landing.hero");

  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-32">
      {/* Background gradient effect */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-primary/20 to-transparent blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-gradient-to-tl from-accent/20 to-transparent blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-1.5 text-sm font-medium text-muted-foreground backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            {t("badge")}
          </div>

          {/* Title */}
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
            {t("title")}{" "}
            <span className="bg-gradient-to-r from-primary via-chart-1 to-chart-2 bg-clip-text text-transparent">
              {t("titleHighlight")}
            </span>
          </h1>

          {/* Description */}
          <p className="mt-6 text-lg leading-8 text-muted-foreground sm:text-xl">
            {t("description")}
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="min-w-[160px] gap-2 rounded-full shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30">
              {t("cta.getStarted")}
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" className="min-w-[160px] gap-2 rounded-full">
              <Github className="h-4 w-4" />
              {t("cta.viewGithub")}
            </Button>
          </div>
        </div>

        {/* Hero Image / Code Preview Area */}
        <div className="mt-16 sm:mt-24">
          <div className="relative mx-auto max-w-5xl">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/10 dark:shadow-black/30">
              {/* Terminal Header */}
              <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <div className="h-3 w-3 rounded-full bg-yellow-500" />
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="ml-2 text-sm text-muted-foreground">vibe-habitat</span>
              </div>
              {/* Terminal Content */}
              <div className="p-6 font-mono text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-green-500">➜</span>
                  <span className="text-chart-1">vibe-habitat</span>
                  <span className="text-muted-foreground">git:(</span>
                  <span className="text-red-400">main</span>
                  <span className="text-muted-foreground">)</span>
                </div>
                <div className="mt-2 text-muted-foreground">
                  <span className="text-foreground">$ </span>
                  <span className="text-chart-2">bun</span>
                  <span> dev</span>
                </div>
                <div className="mt-4 space-y-1 text-muted-foreground">
                  <p><span className="text-green-500">✓</span> Ready in 245ms</p>
                  <p className="pl-4">- Local: <span className="text-chart-1 underline">http://localhost:3000</span></p>
                  <p className="pl-4">- Network: <span className="text-chart-1 underline">http://192.168.1.100:3000</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
