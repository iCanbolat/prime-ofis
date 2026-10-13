import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { authApi } from "@/features/auth/api"
import { useAuthStore } from "@/features/auth/store"
import { useVaultStore } from "@/features/kasa/store"

export const personelKeys = {
  all: ["personel"] as const,
}

export const oturumKey = ["auth", "me"] as const

/**
 * Sunucudaki oturumu doğrular. Yerel kullanıcı (localStorage) yalnızca önbellektir: açılışta
 * `/auth/me` ile tazelenir; 401 → `http.ts` yetkisiz işleyicisi oturumu temizler.
 */
export function useOturum(enabled = true) {
  const query = useQuery({
    queryKey: oturumKey,
    queryFn: authApi.me,
    enabled,
    staleTime: Infinity,
    retry: false,
  })
  const personel = query.data?.personel
  useEffect(() => {
    if (!personel) return
    const { user, setUser } = useAuthStore.getState()
    if (JSON.stringify(user) !== JSON.stringify(personel)) setUser(personel)
  }, [personel])
  return query
}

export function usePersonelList() {
  return useQuery({ queryKey: personelKeys.all, queryFn: authApi.personelList })
}

/** Personel yönetimi mutasyonları (Ayarlar → Personel); hepsi yönetici şifresi ister. */
function usePersonelMutasyonu<TVars, TData>(
  mutationFn: (vars: TVars) => Promise<TData>,
  onData?: (data: TData) => void
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      onData?.(data)
      return queryClient.invalidateQueries({ queryKey: personelKeys.all })
    },
  })
}

export const usePersonelOlustur = () =>
  usePersonelMutasyonu(authApi.personelOlustur)
export const usePersonelSifre = () =>
  usePersonelMutasyonu(authApi.personelSifre)
export const usePersonelSil = () => usePersonelMutasyonu(authApi.personelSil)

export const usePersonelGuncelle = () =>
  usePersonelMutasyonu(authApi.personelGuncelle, (personel) => {
    // Yönetici kendi kaydını düzenlediyse oturumdaki kopya da güncellensin
    const { user, setUser } = useAuthStore.getState()
    if (user?.id === personel.id) setUser(personel)
  })

export function useLogin() {
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: ({ personel }) => {
      // Önceki kullanıcının önbelleği yeni oturuma taşınmasın
      queryClient.clear()
      queryClient.setQueryData(oturumKey, { personel })
      setUser(personel)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const clear = useAuthStore((s) => s.clear)
  return useMutation({
    mutationFn: authApi.logout,
    // Sunucu hatası olsa bile oturum kapatılır.
    onSettled: () => {
      useVaultStore.getState().lock()
      clear()
      queryClient.clear()
    },
  })
}
