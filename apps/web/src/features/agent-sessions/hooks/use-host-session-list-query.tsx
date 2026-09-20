"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

type HostSessionListQueryValue = {
  listQuery: string;
  setListQuery: (query: string) => void;
};

const HostSessionListQueryContext = createContext<HostSessionListQueryValue | null>(null);

export function HostSessionListQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [listQuery, setListQuery] = useState("");
  const value = useMemo(
    () => ({ listQuery, setListQuery }),
    [listQuery],
  );
  return (
    <HostSessionListQueryContext.Provider value={value}>
      {children}
    </HostSessionListQueryContext.Provider>
  );
}

export function useHostSessionListQuery(): HostSessionListQueryValue {
  const ctx = useContext(HostSessionListQueryContext);
  const local = useState("");
  if (ctx) return ctx;
  return { listQuery: local[0], setListQuery: local[1] };
}
