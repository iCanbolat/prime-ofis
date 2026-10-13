import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { aktiviteKeys } from "@/features/aktivite/queries"
import { arsivKeys } from "@/features/arsiv/queries"
import { gorevKeys } from "@/features/gorev/queries"
import { tebligatApi } from "@/features/tebligat/api"
import type {
  TebligatEkleRequest,
  TebligatErisimKaydetRequest,
  TebligatErisimListParams,
  TebligatGuncelleRequest,
  TebligatListParams,
} from "@prime/shared/types/api"

export const tebligatKeys = {
  all: ["tebligat"] as const,
  liste: (params: TebligatListParams) =>
    [...tebligatKeys.all, "liste", params] as const,
  ozet: (params: { sorumlu?: string }) =>
    [...tebligatKeys.all, "ozet", params] as const,
  detay: (id: string) => [...tebligatKeys.all, "detay", id] as const,
  erisimler: (params: TebligatErisimListParams) =>
    [...tebligatKeys.all, "erisim", "liste", params] as const,
  erisim: (mukellefId: string) =>
    [...tebligatKeys.all, "erisim", mukellefId] as const,
}

export function useTebligatlar(params: TebligatListParams) {
  return useQuery({
    queryKey: tebligatKeys.liste(params),
    queryFn: () => tebligatApi.liste(params),
    placeholderData: keepPreviousData,
  })
}

/** Kenar çubuğu rozeti ve dashboard; tebligatlar gece taramasıyla geldiği için periyodik yenilenir */
export function useTebligatOzet(params: { sorumlu?: string } = {}) {
  return useQuery({
    queryKey: tebligatKeys.ozet(params),
    queryFn: () => tebligatApi.ozet(params),
    refetchInterval: 60_000,
  })
}

export function useTebligat(id: string | undefined) {
  return useQuery({
    queryKey: tebligatKeys.detay(id ?? ""),
    queryFn: () => tebligatApi.detay(id!),
    enabled: Boolean(id),
  })
}

export function useTebligatErisimleri(
  params: TebligatErisimListParams = {},
  enabled = true
) {
  return useQuery({
    queryKey: tebligatKeys.erisimler(params),
    queryFn: () => tebligatApi.erisimler(params),
    enabled,
  })
}

export function useTebligatErisim(mukellefId: string, enabled = true) {
  return useQuery({
    queryKey: tebligatKeys.erisim(mukellefId),
    queryFn: () => tebligatApi.erisim(mukellefId),
    enabled,
  })
}

function useInvalidate(ekler: { gorev?: boolean; arsiv?: boolean } = {}) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tebligatKeys.all }),
      queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
      ekler.gorev && queryClient.invalidateQueries({ queryKey: gorevKeys.all }),
      ekler.arsiv && queryClient.invalidateQueries({ queryKey: arsivKeys.all }),
    ])
}

export function useTebligatEkle() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: TebligatEkleRequest) => tebligatApi.ekle(body),
    onSuccess: invalidate,
  })
}

export function useTebligatGuncelle() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: TebligatGuncelleRequest & { id: string }) =>
      tebligatApi.guncelle(id, body),
    onSuccess: invalidate,
  })
}

export function useTebligatGorev() {
  const invalidate = useInvalidate({ gorev: true })
  return useMutation({
    mutationFn: tebligatApi.gorevOlustur,
    onSuccess: invalidate,
  })
}

export function useTebligatBelge() {
  const invalidate = useInvalidate({ arsiv: true })
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      dosya: { ad: string; dataUrl: string }
    }) => tebligatApi.belgeYukle(id, body),
    onSuccess: invalidate,
  })
}

export function useTebligatErisimKaydet() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      mukellefId,
      ...body
    }: TebligatErisimKaydetRequest & { mukellefId: string }) =>
      tebligatApi.erisimKaydet(mukellefId, body),
    onSuccess: invalidate,
  })
}

export function useTebligatErisimKaldir() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: tebligatApi.erisimKaldir,
    onSuccess: invalidate,
  })
}

/** Tek mükellefi gece beklemeden tarar; hata da erişim durumunu değiştirdiği için her durumda yenilenir */
export function useTebligatMukellefTara() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: tebligatApi.mukellefTara,
    onSettled: invalidate,
  })
}
