import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { aktiviteKeys } from "@/features/aktivite/queries"
import { kasaApi } from "@/features/kasa/api"
import { useVaultStore } from "@/features/kasa/store"
import { verifyKey } from "@/lib/crypto"
import { ApiError } from "@/lib/http"
import type {
  CredentialCreateRequest,
  CredentialErisimRequest,
  CredentialListParams,
  CredentialUpdateRequest,
  KasaAnahtarDegistirRequest,
  KasaKurulumRequest,
} from "@prime/shared/types/api"

export const kasaKeys = {
  all: ["kasa"] as const,
  meta: () => [...kasaKeys.all, "meta"] as const,
  lists: () => [...kasaKeys.all, "list"] as const,
  list: (params: CredentialListParams) =>
    [...kasaKeys.lists(), params] as const,
}

export const kasaMetaQuery = {
  queryKey: kasaKeys.meta(),
  queryFn: kasaApi.meta,
  staleTime: Infinity,
}

/** Kasa henüz kurulmadıysa sunucu meta için 404 döner */
export const kasaKurulmamis = (error: unknown) =>
  error instanceof ApiError && error.status === 404

/** Kasa meta'sı; `kurulmamis` → yönetici kurulum yapmalı */
export function useKasaMeta() {
  const query = useQuery({
    ...kasaMetaQuery,
    retry: (sayi, error) => !kasaKurulmamis(error) && sayi < 2,
  })
  return { ...query, kurulmamis: kasaKurulmamis(query.error) }
}

export function useKasaKurulum() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: KasaKurulumRequest) => kasaApi.kurulum(body),
    onSuccess: (meta) => {
      queryClient.setQueryData(kasaKeys.meta(), meta)
      return queryClient.invalidateQueries({ queryKey: aktiviteKeys.all })
    },
  })
}

export function useKasaAnahtarDegistir() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: KasaAnahtarDegistirRequest) =>
      kasaApi.anahtarDegistir(body),
    onSuccess: (meta) => {
      queryClient.setQueryData(kasaKeys.meta(), meta)
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: kasaKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
      ])
    },
  })
}

/**
 * Yazmadan önce bellekteki anahtarın güncel kasa anahtarı olduğunu doğrular: başka bir
 * oturumda ana şifre değiştiyse eski anahtarla şifrelenen kayıt bir daha çözülemezdi.
 * Anahtar eskiyse kasa kilitlenir ve hata fırlatılır.
 */
export async function kasaAnahtariGuncelMi() {
  const { key, lock } = useVaultStore.getState()
  if (!key) return
  const meta = await kasaApi.meta()
  if (!(await verifyKey(key, meta.verifier))) {
    lock()
    throw new Error(
      "Kasa ana şifresi değiştirilmiş. Kasayı yeni ana şifreyle açıp yeniden deneyin."
    )
  }
}

export function useCredentials(params: CredentialListParams = {}) {
  return useQuery({
    queryKey: kasaKeys.list(params),
    queryFn: () => kasaApi.list(params),
  })
}

/** Şifre değişiklikleri kasa listelerini ve aktivite akışını tazeler. */
function useInvalidateKasa() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: kasaKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: aktiviteKeys.all }),
    ])
}

export function useCreateCredential() {
  const invalidate = useInvalidateKasa()
  return useMutation({
    mutationFn: async (body: CredentialCreateRequest) => {
      await kasaAnahtariGuncelMi()
      return kasaApi.create(body)
    },
    onSuccess: invalidate,
  })
}

export function useUpdateCredential() {
  const invalidate = useInvalidateKasa()
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: CredentialUpdateRequest & { id: string }) => {
      await kasaAnahtariGuncelMi()
      return kasaApi.update(id, body)
    },
    onSuccess: invalidate,
  })
}

export function useDeleteCredential() {
  const invalidate = useInvalidateKasa()
  return useMutation({
    mutationFn: (id: string) => kasaApi.remove(id),
    onSuccess: invalidate,
  })
}

export function useCredentialErisim() {
  const invalidate = useInvalidateKasa()
  return useMutation({
    mutationFn: ({ id, eylem }: CredentialErisimRequest & { id: string }) =>
      kasaApi.erisim(id, { eylem }),
    onSuccess: invalidate,
  })
}
