import { Suspense } from "react";

import { BrowserStandalonePage } from "@/features/browser/components/BrowserStandalonePage";

export default function BrowserSessionPage() {
  return (
    <Suspense fallback={<main className="h-dvh min-h-0 bg-background text-foreground" />}>
      <BrowserStandalonePage />
    </Suspense>
  );
}
