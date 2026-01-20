"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Github } from "lucide-react";

export function Footer() {
  const t = useTranslations("landing.footer");

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Logo and Copyright */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">V</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">ATMOS</span>
              <span className="text-xs text-muted-foreground">{t("copyright")}</span>
            </div>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            <Link
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Github className="h-4 w-4" />
              {t("links.github")}
            </Link>
            <Link
              href="/docs"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("links.docs")}
            </Link>
            <Link
              href="https://discord.gg"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("links.discord")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
