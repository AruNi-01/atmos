import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { routing } from "@atmos/i18n/routing";

type Props = {
  params: Promise<{ locale: string; projectId: string }>;
};

export const metadata: Metadata = {
  title: "Project – ATMOS",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale, projectId: "__desktop__" }));
}

export default async function ProjectPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return null;
}
