"use client";

import { useTranslations } from "next-intl";
import { Box, Globe, Moon, Package, Shield, Zap } from "lucide-react";

const featureIcons = {
  monorepo: Box,
  i18n: Globe,
  theming: Moon,
  components: Package,
  typescript: Shield,
  performance: Zap,
};

export function FeaturesSection() {
  const t = useTranslations("landing.features");

  const features = [
    { key: "monorepo", icon: featureIcons.monorepo },
    { key: "i18n", icon: featureIcons.i18n },
    { key: "theming", icon: featureIcons.theming },
    { key: "components", icon: featureIcons.components },
    { key: "typescript", icon: featureIcons.typescript },
    { key: "performance", icon: featureIcons.performance },
  ];

  return (
    <section id="features" className="py-20 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        {/* Features Grid */}
        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1"
            >
              {/* Gradient overlay on hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

              <div className="relative">
                {/* Icon */}
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110">
                  <Icon className="h-6 w-6" />
                </div>

                {/* Content */}
                <h3 className="mt-6 text-xl font-semibold text-foreground">
                  {t(`items.${key}.title`)}
                </h3>
                <p className="mt-2 text-muted-foreground">
                  {t(`items.${key}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
