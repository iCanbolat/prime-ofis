import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { aktiviteKeys } from "@/features/aktivite/queries"
import { evrakTalebiKeys } from "@/features/evrak-talebi/queries"
import { kanalApi } from "@/features/kanal/api"
import type {
  BildirimTercihKaydetRequest,
  GonderimListParams,
  KanalKaydetRequest,
  MukellefGonderRequest,
} from "@prime/shared/types/api"

export const kanalKeys = {
  all: ["kanal"] as const,
  kanallar: ["kanal", "ayarlar"] as const,
  tercih: ["kanal", "tercih"] as const,
  gonderimler: (params: GonderimListParams) =>
    ["kanal", "gonderimler", params] as const,
}

export function useKanallar() {
  return useQuery({ queryKey: kanalKeys.kanallar, queryFn: kanalApi.kanallar })
}

export function useBildirimTercihi() {
  return useQuery({ queryKey: kanalKeys.tercih, queryFn: kanalApi.tercih })
}

export function useGonderimler(params: GonderimListParams) {
  return useQuery({
    queryKey: kanalKeys.gonderimler(params),
    queryFn: () => kanalApi.gonderimler(params),
    placeholderData: keepPreviousData,
  })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: kanalKeys.all }),
      queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
    ])
}

export function useKanalKaydet() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: KanalKaydetRequest) => kanalApi.kaydet(body),
    onSuccess: invalidate,
  })
}

export function useKanalKaldir() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: kanalApi.kaldir, onSuccess: invalidate })
}

export function useKanalTest() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: kanalApi.test, onSuccess: invalidate })
}

export function useTercihKaydet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: BildirimTercihKaydetRequest) =>
      kanalApi.tercihKaydet(body),
    onSuccess: (t) => queryClient.setQueryData(kanalKeys.tercih, t),
  })
}

export function useTelegramBaglantisi() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: kanalApi.telegramBaglantisi,
    onSuccess: invalidate,
  })
}

export function useTelegramDogrula() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: kanalApi.telegramDogrula,
    onSuccess: (t) => queryClient.setQueryData(kanalKeys.tercih, t),
  })
}

export function useTelegramKaldir() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: kanalApi.telegramKaldir,
    onSuccess: (t) => queryClient.setQueryData(kanalKeys.tercih, t),
  })
}

export function useGonderimTekrar() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: kanalApi.tekrar, onSuccess: invalidate })
}

/** Talep gönderimi talep listesini de, önizleme hiçbir şeyi etkilemez */
export function useMukellefeGonder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: MukellefGonderRequest) => kanalApi.mukellefeGonder(body),
    onSuccess: (_, body) =>
      body.onizleme
        ? undefined
        : Promise.all([
            queryClient.invalidateQueries({ queryKey: kanalKeys.all }),
            queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
            queryClient.invalidateQueries({ queryKey: evrakTalebiKeys.all }),
          ]),
  })
}
