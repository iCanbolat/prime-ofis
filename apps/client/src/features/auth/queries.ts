import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { authApi } from "@/features/auth/api"
import { useAuthStore } from "@/features/auth/store"
import { useVaultStore } from "@/features/kasa/store"

export const personelKeys = {
  all: ["personel"] as const,
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
  const setUser = useAuthStore((s) => s.setUser)
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: ({ personel }) => setUser(personel),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)
  return useMutation({
    mutationFn: async () => {
      if (user) await authApi.logout(user.id)
    },
    // Sunucu hatası olsa bile oturum kapatılır.
    onSettled: () => {
      useVaultStore.getState().lock()
      clear()
      queryClient.clear()
    },
  })
}
