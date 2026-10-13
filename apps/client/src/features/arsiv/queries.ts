import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { aktiviteKeys } from "@/features/aktivite/queries"
import { arsivApi } from "@/features/arsiv/api"
import type {
  ArsivAgacParams,
  ArsivGuncelleRequest,
  ArsivListParams,
  ArsivOzetParams,
  ArsivYukleRequest,
} from "@prime/shared/types/api"

export const arsivKeys = {
  all: ["arsiv"] as const,
  list: (params: ArsivListParams) =>
    [...arsivKeys.all, "list", params] as const,
  agac: (params: ArsivAgacParams) =>
    [...arsivKeys.all, "agac", params] as const,
  ozet: (params: ArsivOzetParams) =>
    [...arsivKeys.all, "ozet", params] as const,
  icerik: (id: string) => [...arsivKeys.all, "icerik", id] as const,
}

export function useArsivList(params: ArsivListParams) {
  return useQuery({
    queryKey: arsivKeys.list(params),
    queryFn: () => arsivApi.list(params),
    placeholderData: keepPreviousData,
  })
}

export function useArsivAgac(params: ArsivAgacParams = {}) {
  return useQuery({
    queryKey: arsivKeys.agac(params),
    queryFn: () => arsivApi.agac(params),
  })
}

export function useArsivOzet(params: ArsivOzetParams = {}) {
  return useQuery({
    queryKey: arsivKeys.ozet(params),
    queryFn: () => arsivApi.ozet(params),
  })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: arsivKeys.all,
        predicate: (q) => q.queryKey[1] !== "icerik",
      }),
      queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
    ])
}

export function useArsivYukle() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: ArsivYukleRequest) => arsivApi.yukle(body),
    onSuccess: invalidate,
  })
}

export function useArsivGuncelle() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: ArsivGuncelleRequest & { id: string }) =>
      arsivApi.guncelle(id, body),
    onSuccess: invalidate,
  })
}

export function useArsivSil() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => arsivApi.sil(id),
    onSuccess: invalidate,
  })
}

export function useArsivGeriAl() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => arsivApi.geriAl(id),
    onSuccess: invalidate,
  })
}

export function useArsivKaliciSil() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => arsivApi.kaliciSil(id),
    onSuccess: invalidate,
  })
}
