import { MutationCache, QueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/http"

/** Bildirim sorgusunun kök anahtarı (`features/bildirim/queries.ts` ile aynı) */
const BILDIRIM_KEY = ["bildirim"] as const

export function createQueryClient() {
  const isTest = import.meta.env.MODE === "test"
  const queryClient: QueryClient = new QueryClient({
    // Her başarılı işlem bildirim üretebilir (ör. hatırlatma kapanır, yayın düşer): zili tazele
    mutationCache: new MutationCache({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: BILDIRIM_KEY }),
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (isTest) return false
          if (error instanceof ApiError && error.status < 500) return false
          return failureCount < 2
        },
      },
      mutations: { retry: false },
    },
  })
  return queryClient
}
