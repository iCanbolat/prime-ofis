import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ayarlarApi } from "@/features/ayarlar/api"

export const ayarlarKeys = {
  buro: ["buro"] as const,
  devStats: ["dev", "stats"] as const,
}

export function useBuro() {
  return useQuery({
    queryKey: ayarlarKeys.buro,
    queryFn: ayarlarApi.buro,
    staleTime: Infinity,
  })
}

export function useMockDbStats() {
  return useQuery({
    queryKey: ayarlarKeys.devStats,
    queryFn: ayarlarApi.mockDbStats,
    staleTime: 0,
  })
}

export function useResetMockDb() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ayarlarApi.resetMockDb,
    // Tüm önbellek geçersiz: seed'e dönen veri her ekranda yeniden çekilir.
    onSuccess: () => queryClient.invalidateQueries(),
  })
}
