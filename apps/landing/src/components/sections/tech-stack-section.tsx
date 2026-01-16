"use client";

import { useTranslations } from "next-intl";

export function TechStackSection() {
  const t = useTranslations("landing.techStack");

  const technologies = [
    { key: "nextjs", color: "from-gray-700 to-gray-900" },
    { key: "react", color: "from-cyan-400 to-blue-500" },
    { key: "typescript", color: "from-blue-500 to-blue-700" },
    { key: "tailwind", color: "from-teal-400 to-cyan-500" },
    { key: "bun", color: "from-orange-400 to-pink-500" },
  ];

  return (
    <section id="tech-stack" className="py-20 sm:py-32 bg-muted/30">
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

        {/* Tech Stack Grid */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {technologies.map(({ key, color }) => (
            <div
              key={key}
              className="group relative overflow-hidden rounded-xl border border-border bg-card p-8 text-center transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
            >
              {/* Animated gradient background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 transition-opacity duration-300 group-hover:opacity-10`} />

              <div className="relative">
                <div className="text-4xl font-bold text-foreground group-hover:scale-110 transition-transform duration-300">
                  {t(`items.${key}`).split(' ')[0]}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {t(`items.${key}`).split(' ').slice(1).join(' ')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
