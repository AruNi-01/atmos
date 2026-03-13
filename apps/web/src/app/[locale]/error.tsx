'use client';

import { useEffect } from 'react';
import { ErrorDisplay } from '@/components/error-display';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[LocaleError]', error);
  }, [error]);

  return (
    <ErrorDisplay
      message={error.message}
      onRetry={reset}
      className="min-h-dvh"
    />
  );
}
