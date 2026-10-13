import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { aktiviteKeys } from "@/features/aktivite/queries"
import { fisAktarimiApi } from "@/features/fis-aktarimi/api"
import type {
  FisGuncelleRequest,
  FisHesapAyariRequest,
  FisListParams,
  LucaAktarimRequest,
} from "@prime/shared/types/api"
import type { LucaSablonAyari } from "@prime/shared/types/domain"

export const fisAktarimiKeys = {
  all: ["fis-aktarimi"] as const,
  fisler: (params: FisListParams) =>
    [...fisAktarimiKeys.all, "fisler", params] as const,
  fis: (id: string) => [...fisAktarimiKeys.all, "fis", id] as const,
  sayac: ["fis-aktarimi", "sayac"] as const,
  okumalar: (params: { mukellefId?: string }) =>
    [...fisAktarimiKeys.all, "okumalar", params] as const,
  hesaplar: (mukellefId: string) =>
    [...fisAktarimiKeys.all, "hesaplar", mukellefId] as const,
  sablon: ["fis-aktarimi", "sablon"] as const,
  aktarimlar: (params: { mukellefId?: string }) =>
    [...fisAktarimiKeys.all, "aktarimlar", params] as const,
}

/** Okunmakta olan belge varken listeler kısa aralıkla yenilenir */
const OKUMA_YENILEME_MS = 2_000

export function useFisSayac() {
  return useQuery({
    queryKey: fisAktarimiKeys.sayac,
    queryFn: fisAktarimiApi.sayac,
    refetchInterval: (q) =>
      q.state.data?.okunuyor ? OKUMA_YENILEME_MS : 30_000,
  })
}

export function useFisler(params: FisListParams = {}) {
  return useQuery({
    queryKey: fisAktarimiKeys.fisler(params),
    queryFn: () => fisAktarimiApi.fisler(params),
  })
}

export function useOkumalar(params: { mukellefId?: string } = {}) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: fisAktarimiKeys.okumalar(params),
    queryFn: async () => {
      const okumalar = await fisAktarimiApi.okumalar(params)
      // Okuma bitince oluşan taslaklar listede görünsün
      void queryClient.invalidateQueries({
        queryKey: [...fisAktarimiKeys.all, "fisler"],
      })
      return okumalar
    },
    refetchInterval: (q) =>
      q.state.data?.some((o) => o.durum === "OKUNUYOR")
        ? OKUMA_YENILEME_MS
        : false,
  })
}

export function useFis(id: string | undefined) {
  return useQuery({
    queryKey: fisAktarimiKeys.fis(id ?? ""),
    queryFn: () => fisAktarimiApi.fis(id!),
    enabled: Boolean(id),
  })
}

export function useFisHesaplari(mukellefId: string | undefined) {
  return useQuery({
    queryKey: fisAktarimiKeys.hesaplar(mukellefId ?? ""),
    queryFn: () => fisAktarimiApi.hesaplar(mukellefId!),
    enabled: Boolean(mukellefId),
  })
}

export function useLucaSablonu() {
  return useQuery({
    queryKey: fisAktarimiKeys.sablon,
    queryFn: fisAktarimiApi.sablon,
  })
}

export function useLucaAktarimlari(params: { mukellefId?: string } = {}) {
  return useQuery({
    queryKey: fisAktarimiKeys.aktarimlar(params),
    queryFn: () => fisAktarimiApi.aktarimlar(params),
  })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: fisAktarimiKeys.all }),
      queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
    ])
}

export function useFisGuncelle() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: FisGuncelleRequest & { id: string }) =>
      fisAktarimiApi.guncelle(id, body),
    onSuccess: invalidate,
  })
}

export function useFisOnayla() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => fisAktarimiApi.onayla(id),
    onSuccess: invalidate,
  })
}

export function useFisTaslagaAl() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => fisAktarimiApi.taslagaAl(id),
    onSuccess: invalidate,
  })
}

export function useYenidenOku() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (okumaId: string) => fisAktarimiApi.yenidenOku(okumaId),
    onSuccess: invalidate,
  })
}

export function useFisHesaplariKaydet(mukellefId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: FisHesapAyariRequest) =>
      fisAktarimiApi.hesaplariKaydet(mukellefId, body),
    onSuccess: invalidate,
  })
}

export function useLucaSablonuKaydet() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: LucaSablonAyari) => fisAktarimiApi.sablonKaydet(body),
    onSuccess: invalidate,
  })
}

export function useLucaAktar() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: LucaAktarimRequest) => fisAktarimiApi.aktar(body),
    onSuccess: invalidate,
  })
}

export function useLucaGeriAl() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => fisAktarimiApi.geriAl(id),
    onSuccess: invalidate,
  })
}
