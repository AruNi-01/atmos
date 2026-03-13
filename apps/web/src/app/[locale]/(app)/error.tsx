'use client';

import { useEffect } from 'react';
import { ErrorDisplay } from '@/components/error-display';

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
    <ErrorDisplay
      message={error.message}
      fallbackMessage="An unexpected error occurred in the application."
      onRetry={reset}
      className="flex-1"
    />
  );
}
