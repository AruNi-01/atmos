import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";

import { PreviewBrowserStandalonePage } from "@/features/run-preview/components/PreviewBrowserStandalonePage";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function PreviewPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<main className="h-dvh min-h-0 bg-background text-foreground" />}>
      <PreviewBrowserStandalonePage />
    </Suspense>
  );
}
