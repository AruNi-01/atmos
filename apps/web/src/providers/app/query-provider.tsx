"use client";

import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createAtmosWebQueryClient,
  getAtmosWebQueryClient,
} from "@/providers/app/query-client";
import { QueryFocusBridge } from "@/providers/app/query-focus-bridge";

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  // Prefer sharing the browser singleton when available so event bridges use the same client.
  const [client] = useState(() => {
    if (typeof window === "undefined") {
      return createAtmosWebQueryClient();
    }
    return getAtmosWebQueryClient();
  });

  return (
    <QueryClientProvider client={client}>
      <QueryFocusBridge />
      {children}
    </QueryClientProvider>
  );
}
