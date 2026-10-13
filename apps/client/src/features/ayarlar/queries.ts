import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ayarlarApi } from "@/features/ayarlar/api"
import { MOCK_MODU } from "@/lib/http"

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
    retry: false,
  })
}

/**
 * Geliştirici araçları açık mı: mock modunda her zaman; gerçek API'de yalnızca `DEV_ARACLARI=true`
 * iken (`/dev/stats` uç yoksa 404 döner).
 */
export function useDevAraclari() {
  const stats = useQuery({
    queryKey: ayarlarKeys.devStats,
    queryFn: ayarlarApi.mockDbStats,
    enabled: !MOCK_MODU,
    staleTime: Infinity,
    retry: false,
  })
  return MOCK_MODU || stats.isSuccess
}

export function useResetMockDb() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ayarlarApi.resetMockDb,
    // Tüm önbellek geçersiz: seed'e dönen veri her ekranda yeniden çekilir.
    onSuccess: () => queryClient.invalidateQueries(),
  })
}
