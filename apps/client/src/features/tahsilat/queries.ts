import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { aktiviteKeys } from "@/features/aktivite/queries"
import { ayarlarKeys } from "@/features/ayarlar/queries"
import { mukellefKeys } from "@/features/mukellef/queries"
import { tahsilatApi } from "@/features/tahsilat/api"
import type {
  CariListParams,
  HareketEkleRequest,
  KesintiIceAktarRequest,
  UcretKaydetRequest,
} from "@prime/shared/types/api"

export const tahsilatKeys = {
  all: ["tahsilat"] as const,
  ozet: (params: { sorumlu?: string }) =>
    [...tahsilatKeys.all, "ozet", params] as const,
  cari: (params: CariListParams) =>
    [...tahsilatKeys.all, "cari", params] as const,
  ekstre: (mukellefId: string) =>
    [...tahsilatKeys.all, "ekstre", mukellefId] as const,
  kesinti: (yil?: number) => [...tahsilatKeys.all, "kesinti", yil] as const,
}

export function useTahsilatOzet(params: { sorumlu?: string } = {}) {
  return useQuery({
    queryKey: tahsilatKeys.ozet(params),
    queryFn: () => tahsilatApi.ozet(params),
  })
}

export function useCariList(params: CariListParams) {
  return useQuery({
    queryKey: tahsilatKeys.cari(params),
    queryFn: () => tahsilatApi.cari(params),
    placeholderData: keepPreviousData,
  })
}

export function useCariEkstre(mukellefId: string | undefined) {
  return useQuery({
    queryKey: tahsilatKeys.ekstre(mukellefId ?? ""),
    queryFn: () => tahsilatApi.ekstre(mukellefId!),
    enabled: Boolean(mukellefId),
  })
}

export function useKesintiRaporu(yil?: number) {
  return useQuery({
    queryKey: tahsilatKeys.kesinti(yil),
    queryFn: () => tahsilatApi.kesinti(yil),
    placeholderData: keepPreviousData,
  })
}

/** Cari hareketler özet, liste, ekstre ve kesinti raporunu birlikte etkiler */
function useInvalidate(ekler: { mukellef?: boolean } = {}) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tahsilatKeys.all }),
      queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
      ekler.mukellef &&
        queryClient.invalidateQueries({ queryKey: mukellefKeys.all }),
    ])
}

export function useHareketEkle() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: HareketEkleRequest) => tahsilatApi.hareketEkle(body),
    onSuccess: invalidate,
  })
}

export function useHareketSil() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: tahsilatApi.hareketSil,
    onSuccess: invalidate,
  })
}

export function useUcretKaydet() {
  const invalidate = useInvalidate({ mukellef: true })
  return useMutation({
    mutationFn: ({
      mukellefId,
      ...body
    }: UcretKaydetRequest & { mukellefId: string }) =>
      tahsilatApi.ucretKaydet(mukellefId, body),
    onSuccess: invalidate,
  })
}

export function useKesintiIceAktar() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: KesintiIceAktarRequest) =>
      tahsilatApi.kesintiIceAktar(body),
    onSuccess: invalidate,
  })
}

export function useBuroGuncelle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: tahsilatApi.buroGuncelle,
    onSuccess: (buro) => queryClient.setQueryData(ayarlarKeys.buro, buro),
  })
}
