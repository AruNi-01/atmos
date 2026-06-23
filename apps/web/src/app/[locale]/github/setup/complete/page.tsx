import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { GithubSetupCompletionPage } from "@/features/automations/components/GithubSetupCompletionPage";

type Props = {
  params: Promise<{ locale: string }>;
};

export const metadata = {
  title: "GitHub Setup - ATMOS",
};

export default async function GithubSetupCompleteRoute({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <GithubSetupCompletionPage locale={locale} />
    </Suspense>
  );
}
