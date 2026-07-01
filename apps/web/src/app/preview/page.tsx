import { Suspense } from "react";

import { PreviewBrowserStandalonePage } from "@/features/run-preview/components/PreviewBrowserStandalonePage";

export default function PreviewPage() {
  return (
    <Suspense fallback={<main className="h-dvh min-h-0 bg-background text-foreground" />}>
      <PreviewBrowserStandalonePage />
    </Suspense>
  );
}
