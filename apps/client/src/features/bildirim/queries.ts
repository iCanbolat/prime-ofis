import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"

import { bildirimApi } from "@/features/bildirim/api"
import type { BildirimListParams, BildirimListResponse } from "@prime/shared/types/api"

/** Yeni bildirimler için yoklama aralığı (gerçek backend'de SSE/WebSocket'e dönüşebilir) */
export const BILDIRIM_YOKLAMA_MS = 30_000

export const bildirimKeys = {
  all: ["bildirim"] as const,
  list: (params: BildirimListParams) =>
    [...bildirimKeys.all, "list", params] as const,
}

export function useBildirimler(params: BildirimListParams = {}) {
  return useQuery({
    queryKey: bildirimKeys.list(params),
    queryFn: () => bildirimApi.list(params),
    staleTime: 0,
    refetchInterval: BILDIRIM_YOKLAMA_MS,
    refetchOnWindowFocus: true,
  })
}

/**
 * Önbellekteki tüm bildirim listelerini iyimser olarak okundu yapar (`id` yoksa hepsini).
 * Hata olursa geri almak için önceki hali döner.
 */
async function iyimserOkundu(queryClient: QueryClient, id?: string) {
  await queryClient.cancelQueries({ queryKey: bildirimKeys.all })
  const onceki = queryClient.getQueriesData<BildirimListResponse>({
    queryKey: bildirimKeys.all,
  })
  queryClient.setQueriesData<BildirimListResponse>(
    { queryKey: bildirimKeys.all },
    (data) => {
      if (!data) return data
      const hedef = data.items.find((b) => b.id === id)
      return {
        items: data.items.map((b) =>
          !id || b.id === id ? { ...b, okundu: true } : b
        ),
        okunmamis: !id
          ? 0
          : hedef && !hedef.okundu
            ? Math.max(data.okunmamis - 1, 0)
            : data.okunmamis,
      }
    }
  )
  return { onceki }
}

/** `mutate(id)` tek bildirimi, `mutate(undefined)` tüm bildirimleri okundu yapar. */
export function useOkunduIsaretle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string | undefined) =>
      id ? bildirimApi.okundu(id) : bildirimApi.tumunuOkundu(),
    onMutate: (id) => iyimserOkundu(queryClient, id),
    onError: (_e, _id, ctx) =>
      ctx?.onceki.forEach(([key, data]) => queryClient.setQueryData(key, data)),
  })
}
