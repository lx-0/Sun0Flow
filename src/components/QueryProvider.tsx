"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export class HttpError extends Error {
  constructor(public readonly status: number, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = "HttpError";
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: "always",
        refetchOnReconnect: "always",
        networkMode: "offlineFirst",
        retry: (failureCount, error) => {
          if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        networkMode: "offlineFirst",
        retry: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
