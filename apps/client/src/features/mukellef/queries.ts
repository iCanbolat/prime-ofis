import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { aktiviteKeys } from "@/features/aktivite/queries"
import { mukellefApi } from "@/features/mukellef/api"
import type { MukellefInput, MukellefListParams } from "@prime/shared/types/api"

export const mukellefKeys = {
  all: ["mukellef"] as const,
  lists: () => [...mukellefKeys.all, "list"] as const,
  list: (params: MukellefListParams) =>
    [...mukellefKeys.lists(), params] as const,
  detail: (id: string) => [...mukellefKeys.all, "detail", id] as const,
}

export function useMukellefList(params: MukellefListParams = {}) {
  return useQuery({
    queryKey: mukellefKeys.list(params),
    queryFn: () => mukellefApi.list(params),
    // Sayfa/filtre değişirken tablo boşalmasın
    placeholderData: keepPreviousData,
  })
}

export function useMukellef(id: string) {
  return useQuery({
    queryKey: mukellefKeys.detail(id),
    queryFn: () => mukellefApi.detail(id),
    enabled: Boolean(id),
  })
}

export function useCreateMukellef() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MukellefInput) => mukellefApi.create(input),
    onSuccess: (created) => {
      queryClient.setQueryData(mukellefKeys.detail(created.id), created)
      return queryClient.invalidateQueries({ queryKey: mukellefKeys.lists() })
    },
  })
}

export function useUpdateMukellef(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MukellefInput) => mukellefApi.update(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(mukellefKeys.detail(id), updated)
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: mukellefKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
      ])
    },
  })
}

export function useTopluAtama() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: mukellefApi.topluAtama,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: mukellefKeys.all }),
        queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
      ]),
  })
}
