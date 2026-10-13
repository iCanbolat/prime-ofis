import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { aktiviteKeys } from "@/features/aktivite/queries"
import { kasaApi } from "@/features/kasa/api"
import type {
  CredentialCreateRequest,
  CredentialErisimRequest,
  CredentialListParams,
  CredentialUpdateRequest,
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
    mutationFn: (body: CredentialCreateRequest) => kasaApi.create(body),
    onSuccess: invalidate,
  })
}

export function useUpdateCredential() {
  const invalidate = useInvalidateKasa()
  return useMutation({
    mutationFn: ({ id, ...body }: CredentialUpdateRequest & { id: string }) =>
      kasaApi.update(id, body),
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
