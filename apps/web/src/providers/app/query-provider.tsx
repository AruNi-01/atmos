"use client";

import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import { QueryFocusBridge } from "@/providers/app/query-focus-bridge";

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const client = getAtmosWebQueryClient();

  return (
    <QueryClientProvider client={client}>
      <QueryFocusBridge />
      {children}
    </QueryClientProvider>
  );
}
