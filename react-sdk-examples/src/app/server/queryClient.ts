import { QueryClient } from "@tanstack/react-query";

const globalForServerQueryClient = globalThis as typeof globalThis & {
  __serverQueryClient?: QueryClient;
};

function createServerQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        gcTime: 30 * 60_000,
      },
    },
  });
}

export function getServerQueryClient(): QueryClient {
  if (!globalForServerQueryClient.__serverQueryClient) {
    globalForServerQueryClient.__serverQueryClient = createServerQueryClient();
  }

  return globalForServerQueryClient.__serverQueryClient;
}
