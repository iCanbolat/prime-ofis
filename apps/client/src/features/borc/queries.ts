import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { aktiviteKeys } from "@/features/aktivite/queries"
import { arsivKeys } from "@/features/arsiv/queries"
import { borcApi } from "@/features/borc/api"
import { tebligatKeys } from "@/features/tebligat/queries"
import type {
  BorcListParams,
  BorcuYokturListParams,
  LevhaListParams,
  SgkErisimKaydetRequest,
  SgkErisimSatirDurumu,
} from "@prime/shared/types/api"
import type { KamuKurum } from "@prime/shared/types/domain"

export const borcKeys = {
  all: ["borc"] as const,
  ozet: (params: { sorumlu?: string }) =>
    [...borcKeys.all, "ozet", params] as const,
  liste: (params: BorcListParams) =>
    [...borcKeys.all, "liste", params] as const,
  detay: (mukellefId: string, kurum: KamuKurum) =>
    [...borcKeys.all, "detay", mukellefId, kurum] as const,
  mukellef: (mukellefId: string) =>
    [...borcKeys.all, "mukellef", mukellefId] as const,
  levhalar: (params: LevhaListParams) =>
    [...borcKeys.all, "levha", params] as const,
  borcuYoktur: (params: BorcuYokturListParams) =>
    [...borcKeys.all, "borcu-yoktur", params] as const,
  sgkErisimler: (params: { durum?: SgkErisimSatirDurumu }) =>
    [...borcKeys.all, "sgk-erisim", "liste", params] as const,
  sgkErisim: (mukellefId: string) =>
    [...borcKeys.all, "sgk-erisim", mukellefId] as const,
  dogrulamalar: (params: { mukellefId?: string }) =>
    [...borcKeys.all, "dogrulama", params] as const,
}

/** Kenar çubuğu rozeti ve dashboard; gece sorgusuyla değiştiği için periyodik yenilenir */
export function useBorcOzet(params: { sorumlu?: string } = {}) {
  return useQuery({
    queryKey: borcKeys.ozet(params),
    queryFn: () => borcApi.ozet(params),
    refetchInterval: 60_000,
  })
}

export function useBorcListe(params: BorcListParams) {
  return useQuery({
    queryKey: borcKeys.liste(params),
    queryFn: () => borcApi.liste(params),
    placeholderData: keepPreviousData,
  })
}

export function useBorcDetay(
  hedef: { mukellefId: string; kurum: KamuKurum } | null
) {
  return useQuery({
    queryKey: borcKeys.detay(hedef?.mukellefId ?? "", hedef?.kurum ?? "GIB"),
    queryFn: () => borcApi.detay(hedef!.mukellefId, hedef!.kurum),
    enabled: Boolean(hedef),
  })
}

export function useMukellefBorc(mukellefId: string) {
  return useQuery({
    queryKey: borcKeys.mukellef(mukellefId),
    queryFn: () => borcApi.mukellef(mukellefId),
  })
}

export function useLevhalar(params: LevhaListParams) {
  return useQuery({
    queryKey: borcKeys.levhalar(params),
    queryFn: () => borcApi.levhalar(params),
    placeholderData: keepPreviousData,
  })
}

export function useBorcuYokturListe(params: BorcuYokturListParams) {
  return useQuery({
    queryKey: borcKeys.borcuYoktur(params),
    queryFn: () => borcApi.borcuYokturListe(params),
    placeholderData: keepPreviousData,
  })
}

export function useSgkErisimleri(
  params: { durum?: SgkErisimSatirDurumu } = {},
  enabled = true
) {
  return useQuery({
    queryKey: borcKeys.sgkErisimler(params),
    queryFn: () => borcApi.sgkErisimler(params),
    enabled,
  })
}

export function useSgkErisim(mukellefId: string, enabled = true) {
  return useQuery({
    queryKey: borcKeys.sgkErisim(mukellefId),
    queryFn: () => borcApi.sgkErisim(mukellefId),
    enabled,
  })
}

export function useDogrulamalar(
  params: { mukellefId?: string } = {},
  enabled = true
) {
  return useQuery({
    queryKey: borcKeys.dogrulamalar(params),
    queryFn: () => borcApi.dogrulamalar(params),
    enabled,
  })
}

/**
 * Sorgular arşive (levha, yazı) ve GİB erişim durumuna (girişi başarısız → e-Tebligat erişimi)
 * da yazar; hata da erişim durumunu değiştirebildiği için her durumda yenilenir.
 */
function useInvalidate() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: borcKeys.all }),
      queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
      queryClient.invalidateQueries({ queryKey: arsivKeys.all }),
      queryClient.invalidateQueries({ queryKey: tebligatKeys.all }),
    ])
}

export function useBorcSorgula() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      mukellefId,
      kurum,
    }: {
      mukellefId: string
      kurum: KamuKurum
    }) => borcApi.sorgula(mukellefId, kurum),
    onSettled: invalidate,
  })
}

export function useLevhaSorgula() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: borcApi.levhaSorgula,
    onSettled: invalidate,
  })
}

export function useBorcuYokturTalep() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: borcApi.borcuYokturTalep,
    onSettled: invalidate,
  })
}

export function useBorcuYokturKontrol() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: borcApi.borcuYokturKontrol,
    onSettled: invalidate,
  })
}

export function useSgkErisimKaydet() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      mukellefId,
      ...body
    }: SgkErisimKaydetRequest & { mukellefId: string }) =>
      borcApi.sgkErisimKaydet(mukellefId, body),
    onSuccess: invalidate,
  })
}

export function useSgkErisimKaldir() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: borcApi.sgkErisimKaldir,
    onSuccess: invalidate,
  })
}

export function useDogrulamaCoz() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, kod }: { id: string; kod: string }) =>
      borcApi.dogrulamaCoz(id, kod),
    onSettled: invalidate,
  })
}

export function useDogrulamaYenile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: borcApi.dogrulamaYenile,
    onSettled: () => queryClient.invalidateQueries({ queryKey: borcKeys.all }),
  })
}
