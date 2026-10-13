import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { aktiviteKeys } from "@/features/aktivite/queries"
import { arsivKeys } from "@/features/arsiv/queries"
import { eBelgeApi } from "@/features/e-belge/api"
import { takvimKeys } from "@/features/takvim/queries"
import type {
  BaglantiKaydetRequest,
  BeratListParams,
  EBelgeListParams,
  EFaturaYanitRequest,
  KontorAlimRequest,
  SenkronRequest,
} from "@prime/shared/types/api"

export const eBelgeKeys = {
  all: ["e-belge"] as const,
  baglantilar: ["e-belge", "baglanti"] as const,
  baglanti: (mukellefId: string) =>
    [...eBelgeKeys.baglantilar, mukellefId] as const,
  faturalar: (params: EBelgeListParams) =>
    [...eBelgeKeys.all, "fatura", params] as const,
  fatura: (id: string) => [...eBelgeKeys.all, "fatura-detay", id] as const,
  icerik: (id: string) => [...eBelgeKeys.all, "icerik", id] as const,
  beratlar: (params: BeratListParams) =>
    [...eBelgeKeys.all, "berat", params] as const,
  ozet: (params: { sorumlu?: string }) =>
    [...eBelgeKeys.all, "ozet", params] as const,
  kontor: (params: { donem?: string }) =>
    [...eBelgeKeys.all, "kontor", params] as const,
}

export function useBaglantilar() {
  return useQuery({
    queryKey: eBelgeKeys.baglantilar,
    queryFn: eBelgeApi.baglantilar,
  })
}

export function useBaglanti(mukellefId: string) {
  return useQuery({
    queryKey: eBelgeKeys.baglanti(mukellefId),
    queryFn: () => eBelgeApi.baglanti(mukellefId),
  })
}

export function useFaturalar(params: EBelgeListParams, enabled = true) {
  return useQuery({
    queryKey: eBelgeKeys.faturalar(params),
    queryFn: () => eBelgeApi.faturalar(params),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useFatura(id: string | undefined) {
  return useQuery({
    queryKey: eBelgeKeys.fatura(id ?? ""),
    queryFn: () => eBelgeApi.fatura(id!),
    enabled: Boolean(id),
  })
}

export function useBeratlar(params: BeratListParams = {}) {
  return useQuery({
    queryKey: eBelgeKeys.beratlar(params),
    queryFn: () => eBelgeApi.beratlar(params),
  })
}

/** Kenar çubuğu rozeti ve dashboard; yeni faturalar senkronla geldiği için periyodik yenilenir. */
export function useEBelgeOzet(params: { sorumlu?: string } = {}) {
  return useQuery({
    queryKey: eBelgeKeys.ozet(params),
    queryFn: () => eBelgeApi.ozet(params),
    refetchInterval: 60_000,
  })
}

/** Tüketim senkronla gelen belgelerden hesaplandığı için senkron sonrası da tazelenir. */
export function useKontor(params: { donem?: string } = {}) {
  return useQuery({
    queryKey: eBelgeKeys.kontor(params),
    queryFn: () => eBelgeApi.kontor(params),
    placeholderData: keepPreviousData,
  })
}

/**
 * e-Belge değişiklikleri aktiviteyi; senkron takvimi (berat → beyan) ve arşive kaydetme
 * arşivi de etkiler.
 */
function useInvalidate(ekler: { takvim?: boolean; arsiv?: boolean } = {}) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: eBelgeKeys.all }),
      queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
      ekler.takvim &&
        queryClient.invalidateQueries({ queryKey: takvimKeys.all }),
      ekler.arsiv && queryClient.invalidateQueries({ queryKey: arsivKeys.all }),
    ])
}

export function useSenkron() {
  const invalidate = useInvalidate({ takvim: true })
  return useMutation({
    mutationFn: (body: SenkronRequest = {}) => eBelgeApi.senkron(body),
    onSuccess: invalidate,
  })
}

export function useBaglantiKaydet() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      mukellefId,
      ...body
    }: BaglantiKaydetRequest & { mukellefId: string }) =>
      eBelgeApi.baglantiKaydet(mukellefId, body),
    onSuccess: invalidate,
  })
}

export function useBaglantiKaldir() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: eBelgeApi.baglantiKaldir,
    onSuccess: invalidate,
  })
}

export function useFaturaYanit() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: EFaturaYanitRequest & { id: string }) =>
      eBelgeApi.yanit(id, body),
    onSuccess: invalidate,
  })
}

export function useArsiveKaydet() {
  const invalidate = useInvalidate({ arsiv: true })
  return useMutation({
    mutationFn: eBelgeApi.arsiveKaydet,
    onSuccess: invalidate,
  })
}

export function useKontorAlimEkle() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: KontorAlimRequest) => eBelgeApi.kontorAlimEkle(body),
    onSuccess: invalidate,
  })
}
