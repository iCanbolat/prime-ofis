import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { aktiviteKeys } from "@/features/aktivite/queries"
import { gorevApi } from "@/features/gorev/api"
import { takvimKeys } from "@/features/takvim/queries"
import type {
  DonemOlusturRequest,
  DonemPlanRequest,
  GorevGuncelleRequest,
  GorevListParams,
  GorevOlusturRequest,
  GorevOzetParams,
  GorevTopluRequest,
  GorevView,
} from "@prime/shared/types/api"
import type { GorevDurum } from "@prime/shared/types/domain"

export const gorevKeys = {
  all: ["gorev"] as const,
  lists: ["gorev", "list"] as const,
  list: (params: GorevListParams) => [...gorevKeys.lists, params] as const,
  ozet: (params: GorevOzetParams) =>
    [...gorevKeys.all, "ozet", params] as const,
  detay: (id: string) => [...gorevKeys.all, "detay", id] as const,
  donemPlan: (body: DonemPlanRequest) =>
    [...gorevKeys.all, "donem-plan", body] as const,
}

export function useGorevList(params: GorevListParams) {
  return useQuery({
    queryKey: gorevKeys.list(params),
    queryFn: () => gorevApi.list(params),
    placeholderData: keepPreviousData,
  })
}

export function useGorevOzet(params: GorevOzetParams = {}) {
  return useQuery({
    queryKey: gorevKeys.ozet(params),
    queryFn: () => gorevApi.ozet(params),
  })
}

export function useGorevDetay(id: string | undefined) {
  return useQuery({
    queryKey: gorevKeys.detay(id ?? ""),
    queryFn: () => gorevApi.detay(id!),
    enabled: Boolean(id),
  })
}

export function useDonemPlan(body: DonemPlanRequest | null) {
  return useQuery({
    queryKey: gorevKeys.donemPlan(body ?? { tip: "KDV", donem: "" }),
    queryFn: () => gorevApi.donemOnizleme(body!),
    enabled: Boolean(body?.donem),
    staleTime: 0,
  })
}

/** Görev değişiklikleri takvim (beyan durumu senkronu) ve aktiviteyi de etkiler. */
function useInvalidate() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: gorevKeys.all }),
      queryClient.invalidateQueries({ queryKey: takvimKeys.all }),
      queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
    ])
}

export function useGorevOlustur() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: GorevOlusturRequest) => gorevApi.olustur(body),
    onSuccess: invalidate,
  })
}

export function useGorevGuncelle() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: GorevGuncelleRequest & { id: string }) =>
      gorevApi.guncelle(id, body),
    onSuccess: invalidate,
  })
}

/**
 * Kanban taşıma: önbellekteki listelerde durum anında değişir (optimistic);
 * hata (ör. 403) olursa önceki hâline döner.
 */
export function useGorevTasi() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, durum }: { id: string; durum: GorevDurum }) =>
      gorevApi.tasi(id, durum),
    onMutate: async ({ id, durum }) => {
      await queryClient.cancelQueries({ queryKey: gorevKeys.lists })
      const onceki = queryClient.getQueriesData<GorevView[]>({
        queryKey: gorevKeys.lists,
      })
      queryClient.setQueriesData<GorevView[]>(
        { queryKey: gorevKeys.lists },
        (liste) => liste?.map((g) => (g.id === id ? { ...g, durum } : g))
      )
      return { onceki }
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.onceki ?? [])
        queryClient.setQueryData(key, data)
    },
    onSettled: invalidate,
  })
}

export function useGorevToplu() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: GorevTopluRequest) => gorevApi.toplu(body),
    onSuccess: invalidate,
  })
}

export function useGorevYorum() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, metin }: { id: string; metin: string }) =>
      gorevApi.yorum(id, metin),
    onSuccess: invalidate,
  })
}

export function useGorevSil() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => gorevApi.sil(id),
    onSuccess: invalidate,
  })
}

export function useDonemGorevleriOlustur() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: DonemOlusturRequest) => gorevApi.donemOlustur(body),
    onSuccess: invalidate,
  })
}
