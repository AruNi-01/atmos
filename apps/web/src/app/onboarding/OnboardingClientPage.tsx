'use client';

import React, { useState, useEffect } from 'react';
import OnboardingPage from '@/features/welcome/components/OnboardingPage';
import { useAppRouter } from '@/shared/hooks/use-app-router';

export default function OnboardingClientPage() {
  const router = useAppRouter();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleComplete = () => {
    try {
      localStorage.setItem('atmos_onboarding_done', 'true');
    } catch {
      /* private browsing / storage disabled — still leave onboarding */
    }
    router.replace('/');
  };

  if (!isMounted) {
    return <div className="min-h-screen w-full bg-background" />;
  }

  return <OnboardingPage onComplete={handleComplete} />;
}
