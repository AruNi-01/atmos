'use client';

import { useEffect } from 'react';
import { BreakoutErrorPage } from '@/shared/components/breakout-error-page';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[AppError]', error);
  }, [error]);

  return (
    <BreakoutErrorPage
      kind="server"
      errorMessage={error.message}
      onRetry={reset}
    />
  );
}
