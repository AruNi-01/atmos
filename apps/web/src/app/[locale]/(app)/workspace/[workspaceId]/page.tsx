import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { routing } from "@atmos/i18n/routing";

type Props = {
  params: Promise<{ locale: string; workspaceId: string }>;
};

export const metadata: Metadata = {
  title: "Workspace – ATMOS",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale, workspaceId: "__desktop__" }));
}

export default async function WorkspacePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return null;
}
