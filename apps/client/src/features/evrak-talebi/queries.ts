import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { aktiviteKeys } from "@/features/aktivite/queries"
import { fisAktarimiKeys } from "@/features/fis-aktarimi/queries"
import { arsivKeys } from "@/features/arsiv/queries"
import { bordroKeys } from "@/features/bordro/queries"
import { gorevKeys } from "@/features/gorev/queries"
import { ayarlarKeys } from "@/features/ayarlar/queries"
import { evrakTalebiApi } from "@/features/evrak-talebi/api"
import type {
  GelenListParams,
  GelenOnaylaRequest,
  GelenReddetRequest,
  MesajSablonlari,
  TalepListParams,
  TalepOlusturRequest,
} from "@prime/shared/types/api"
import type { TalepKanal } from "@prime/shared/types/domain"

export const evrakTalebiKeys = {
  all: ["evrak-talebi"] as const,
  list: (params: TalepListParams) =>
    [...evrakTalebiKeys.all, "list", params] as const,
  detay: (id: string) => [...evrakTalebiKeys.all, "detay", id] as const,
  gelen: (params: GelenListParams) =>
    [...evrakTalebiKeys.all, "gelen", params] as const,
  sayac: ["evrak-talebi", "sayac"] as const,
  icerik: (id: string) => ["gelen-icerik", id] as const,
}

export function useTalepList(params: TalepListParams) {
  return useQuery({
    queryKey: evrakTalebiKeys.list(params),
    queryFn: () => evrakTalebiApi.list(params),
    placeholderData: keepPreviousData,
  })
}

export function useTalepDetay(id: string | undefined) {
  return useQuery({
    queryKey: evrakTalebiKeys.detay(id ?? ""),
    queryFn: () => evrakTalebiApi.detay(id!),
    enabled: Boolean(id),
  })
}

export function useGelenList(params: GelenListParams) {
  return useQuery({
    queryKey: evrakTalebiKeys.gelen(params),
    queryFn: () => evrakTalebiApi.gelenList(params),
  })
}

/** Kenar çubuğu rozeti: incelenmeyi bekleyen gelen evrak sayısı (30 sn'de bir yenilenir) */
export function useGelenSayac() {
  return useQuery({
    queryKey: evrakTalebiKeys.sayac,
    queryFn: evrakTalebiApi.gelenSayac,
    refetchInterval: 30_000,
  })
}

function useInvalidate(arsiv = false) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: evrakTalebiKeys.all }),
      queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
      arsiv && queryClient.invalidateQueries({ queryKey: arsivKeys.all }),
      // Onaylanan puantaj bordro dönemini "Girdi geldi" yapar, görev maddesini işaretler
      arsiv && queryClient.invalidateQueries({ queryKey: bordroKeys.all }),
      arsiv && queryClient.invalidateQueries({ queryKey: gorevKeys.all }),
      // Fiş / ekstre onayı okuma başlatır
      arsiv && queryClient.invalidateQueries({ queryKey: fisAktarimiKeys.all }),
    ])
}

export function useTalepOlustur() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: TalepOlusturRequest) => evrakTalebiApi.olustur(body),
    onSuccess: invalidate,
  })
}

export function useTalepGonderim() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, kanal }: { id: string; kanal: TalepKanal }) =>
      evrakTalebiApi.gonderim(id, kanal),
    onSuccess: invalidate,
  })
}

export function useTalepUzat() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, gun }: { id: string; gun: number }) =>
      evrakTalebiApi.uzat(id, gun),
    onSuccess: invalidate,
  })
}

export function useTalepIptal() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => evrakTalebiApi.iptal(id),
    onSuccess: invalidate,
  })
}

export function useTalepYenidenAc() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => evrakTalebiApi.yenidenAc(id),
    onSuccess: invalidate,
  })
}

export function useGelenOnayla() {
  const invalidate = useInvalidate(true)
  return useMutation({
    mutationFn: ({ id, ...body }: GelenOnaylaRequest & { id: string }) =>
      evrakTalebiApi.onayla(id, body),
    onSuccess: invalidate,
  })
}

export function useGelenReddet() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: GelenReddetRequest & { id: string }) =>
      evrakTalebiApi.reddet(id, body),
    onSuccess: invalidate,
  })
}

export function useSablonlariKaydet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: MesajSablonlari) =>
      evrakTalebiApi.sablonlariKaydet(body),
    onSuccess: (buro) => {
      queryClient.setQueryData(ayarlarKeys.buro, buro)
      return queryClient.invalidateQueries({ queryKey: aktiviteKeys.all })
    },
  })
}
