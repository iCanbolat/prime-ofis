import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { aktiviteKeys } from "@/features/aktivite/queries"
import { arsivKeys } from "@/features/arsiv/queries"
import { gorevKeys } from "@/features/gorev/queries"
import { iceAktarimApi } from "@/features/ice-aktarim/api"
import { takvimKeys } from "@/features/takvim/queries"
import type {
  AcilisTopluRequest,
  CredentialTopluRequest,
  MizanIceAktarRequest,
  MukellefTopluRequest,
  TahakkukIceAktarRequest,
} from "@prime/shared/types/api"

export const iceAktarimKeys = {
  all: ["ice-aktarim"] as const,
  tahakkuklar: (params: { mukellefId?: string }) =>
    [...iceAktarimKeys.all, "tahakkuk", params] as const,
  mizanlar: (params: { mukellefId?: string }) =>
    [...iceAktarimKeys.all, "mizan", params] as const,
  mizan: (id: string) => [...iceAktarimKeys.all, "mizan-detay", id] as const,
}

export function useTahakkuklar(params: { mukellefId?: string } = {}) {
  return useQuery({
    queryKey: iceAktarimKeys.tahakkuklar(params),
    queryFn: () => iceAktarimApi.tahakkuklar(params),
  })
}

export function useMizanlar(params: { mukellefId?: string } = {}) {
  return useQuery({
    queryKey: iceAktarimKeys.mizanlar(params),
    queryFn: () => iceAktarimApi.mizanlar(params),
  })
}

export function useMizan(id: string | undefined) {
  return useQuery({
    queryKey: iceAktarimKeys.mizan(id ?? ""),
    queryFn: () => iceAktarimApi.mizan(id!),
    enabled: Boolean(id),
  })
}

/** İçe aktarım arşive dosya yazar ve aktivite üretir; tahakkuk takvimi, mizan görevi etkiler. */
function useInvalidate(ek: { takvim?: boolean; gorev?: boolean }) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: iceAktarimKeys.all }),
      queryClient.invalidateQueries({ queryKey: arsivKeys.all }),
      queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
      ek.takvim && queryClient.invalidateQueries({ queryKey: takvimKeys.all }),
      ek.gorev && queryClient.invalidateQueries({ queryKey: gorevKeys.all }),
    ])
}

export function useTahakkukAktar() {
  const invalidate = useInvalidate({ takvim: true, gorev: true })
  return useMutation({
    mutationFn: (body: TahakkukIceAktarRequest) =>
      iceAktarimApi.tahakkukAktar(body),
    onSuccess: invalidate,
  })
}

export function useMizanAktar() {
  const invalidate = useInvalidate({ gorev: true })
  return useMutation({
    mutationFn: (body: MizanIceAktarRequest) => iceAktarimApi.mizanAktar(body),
    onSuccess: invalidate,
  })
}

/**
 * Hızlı başlangıç aktarımları mükellef, kasa, takvim, tahsilat ve gösterge panelini birlikte
 * etkiler; seyrek yapıldığı için tüm önbellek tazelenir.
 */
function useTopluAktarim<T>(
  mutationFn: (body: T) => ReturnType<typeof iceAktarimApi.mukellefToplu>
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

export const useMukellefTopluAktar = () =>
  useTopluAktarim((body: MukellefTopluRequest) =>
    iceAktarimApi.mukellefToplu(body)
  )

export const useSifreTopluAktar = () =>
  useTopluAktarim((body: CredentialTopluRequest) =>
    iceAktarimApi.sifreToplu(body)
  )

export const useAcilisTopluAktar = () =>
  useTopluAktarim((body: AcilisTopluRequest) => iceAktarimApi.acilisToplu(body))
