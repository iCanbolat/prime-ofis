import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { aktiviteKeys } from "@/features/aktivite/queries"
import { takvimApi } from "@/features/takvim/api"
import type { TakvimListParams, TakvimOzetParams } from "@prime/shared/types/api"
import type { BeyanDurumu } from "@prime/shared/types/domain"

export const takvimKeys = {
  all: ["takvim"] as const,
  list: (params: TakvimListParams) =>
    [...takvimKeys.all, "list", params] as const,
  ozet: (params: TakvimOzetParams) =>
    [...takvimKeys.all, "ozet", params] as const,
}

export function useTakvim(params: TakvimListParams, enabled = true) {
  return useQuery({
    queryKey: takvimKeys.list(params),
    queryFn: () => takvimApi.list(params),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useTakvimOzet(params: TakvimOzetParams = {}) {
  return useQuery({
    queryKey: takvimKeys.ozet(params),
    queryFn: () => takvimApi.ozet(params),
  })
}

export function useTakvimDurumGuncelle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, durum }: { id: string; durum: BeyanDurumu }) =>
      takvimApi.durumGuncelle(id, { durum }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: takvimKeys.all }),
        queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
      ]),
  })
}
