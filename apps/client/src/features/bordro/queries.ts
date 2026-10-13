import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { aktiviteKeys } from "@/features/aktivite/queries"
import { bordroApi } from "@/features/bordro/api"
import { gorevKeys } from "@/features/gorev/queries"
import { arsivKeys } from "@/features/arsiv/queries"
import { mukellefKeys } from "@/features/mukellef/queries"
import type {
  BordroBelgeEkleRequest,
  BordroGuncelleRequest,
  BordroListParams,
  BordroOkuRequest,
  BordroOzetiKaydetRequest,
  IsHareketiEkleRequest,
  IsHareketiGuncelleRequest,
  IsHareketiListParams,
} from "@prime/shared/types/api"

export const bordroKeys = {
  all: ["bordro"] as const,
  liste: (params: BordroListParams) =>
    [...bordroKeys.all, "liste", params] as const,
  ozet: (params: { sorumlu?: string }) =>
    [...bordroKeys.all, "ozet", params] as const,
  mukellef: (mukellefId: string) =>
    [...bordroKeys.all, "mukellef", mukellefId] as const,
  hareketler: (params: IsHareketiListParams) =>
    [...bordroKeys.all, "hareket", params] as const,
  detay: (mukellefId: string, donem: string) =>
    [...bordroKeys.all, "detay", mukellefId, donem] as const,
}

export function useBordroListe(params: BordroListParams) {
  return useQuery({
    queryKey: bordroKeys.liste(params),
    queryFn: () => bordroApi.liste(params),
    placeholderData: keepPreviousData,
  })
}

/** Dashboard "dikkat" kartı */
export function useBordroOzet(params: { sorumlu?: string } = {}) {
  return useQuery({
    queryKey: bordroKeys.ozet(params),
    queryFn: () => bordroApi.ozet(params),
  })
}

export function useMukellefBordro(mukellefId: string) {
  return useQuery({
    queryKey: bordroKeys.mukellef(mukellefId),
    queryFn: () => bordroApi.mukellef(mukellefId),
  })
}

export function useBordroDetay(
  mukellefId: string | undefined,
  donem: string | undefined
) {
  return useQuery({
    queryKey: bordroKeys.detay(mukellefId ?? "", donem ?? ""),
    queryFn: () => bordroApi.detay(mukellefId!, donem!),
    enabled: Boolean(mukellefId && donem),
  })
}

/** Bordro işlemleri aktivite üretir; görev checklist'i ve arşiv de değişebilir. */
export function useBordroInvalidate() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: bordroKeys.all }),
      queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
      queryClient.invalidateQueries({ queryKey: gorevKeys.all }),
    ])
}

export function useBordroGuncelle() {
  const invalidate = useBordroInvalidate()
  return useMutation({
    mutationFn: ({
      mukellefId,
      donem,
      ...body
    }: BordroGuncelleRequest & { mukellefId: string; donem: string }) =>
      bordroApi.guncelle(mukellefId, donem, body),
    onSuccess: invalidate,
  })
}

export function useBordroOku() {
  return useMutation({
    mutationFn: (body: BordroOkuRequest) => bordroApi.oku(body),
  })
}

/** Özet kaydı arşive dosya yazar ve görev checklist'ini işaretler */
export function useBordroOzetiKaydet() {
  const invalidate = useBordroInvalidate()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      mukellefId,
      donem,
      ...body
    }: BordroOzetiKaydetRequest & { mukellefId: string; donem: string }) =>
      bordroApi.ozetiKaydet(mukellefId, donem, body),
    onSuccess: () =>
      Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: arsivKeys.all }),
      ]),
  })
}

/** Döneme belge ekler (arşive yazılır) */
export function useBordroBelgeEkle() {
  const invalidate = useBordroInvalidate()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      mukellefId,
      donem,
      ...body
    }: BordroBelgeEkleRequest & { mukellefId: string; donem: string }) =>
      bordroApi.belgeEkle(mukellefId, donem, body),
    onSuccess: () =>
      Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: arsivKeys.all }),
      ]),
  })
}

/** Bordrodaki çalışan sayısını mükellef kartına uygular */
export function useBordroCalisanUygula() {
  const invalidate = useBordroInvalidate()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      mukellefId,
      donem,
    }: {
      mukellefId: string
      donem: string
    }) => bordroApi.calisanUygula(mukellefId, donem),
    onSuccess: () =>
      Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: mukellefKeys.all }),
      ]),
  })
}

export function useIsHareketleri(params: IsHareketiListParams = {}) {
  return useQuery({
    queryKey: bordroKeys.hareketler(params),
    queryFn: () => bordroApi.hareketler(params),
  })
}

export function useIsHareketiEkle() {
  const invalidate = useBordroInvalidate()
  return useMutation({
    mutationFn: (body: IsHareketiEkleRequest) => bordroApi.hareketEkle(body),
    onSuccess: invalidate,
  })
}

export function useIsHareketiGuncelle() {
  const invalidate = useBordroInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: IsHareketiGuncelleRequest & { id: string }) =>
      bordroApi.hareketGuncelle(id, body),
    onSuccess: invalidate,
  })
}

export function useIsHareketiSil() {
  const invalidate = useBordroInvalidate()
  return useMutation({
    mutationFn: (id: string) => bordroApi.hareketSil(id),
    onSuccess: invalidate,
  })
}
