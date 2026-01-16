"use client";

import { useTranslations } from "next-intl";
import { Button } from "@vibe-habitat/ui";
import { ArrowRight } from "lucide-react";

export function CTASection() {
  const t = useTranslations("landing.cta");

  return (
    <section className="py-20 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-chart-1/5 to-chart-2/10 p-12 sm:p-16 lg:p-20">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 h-96 w-96 rounded-full bg-gradient-to-br from-primary/20 to-transparent blur-3xl" />
          <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-gradient-to-tr from-chart-2/20 to-transparent blur-3xl" />

          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
              {t("title")}
            </h2>
            <p className="mt-6 text-lg text-muted-foreground">
              {t("description")}
            </p>
            <div className="mt-10">
              <Button size="lg" className="min-w-[200px] gap-2 rounded-full shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30">
                {t("button")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
