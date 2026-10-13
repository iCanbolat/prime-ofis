import { useQuery } from "@tanstack/react-query"

import { aktiviteApi } from "@/features/aktivite/api"
import type { AktiviteListParams } from "@prime/shared/types/api"

export const aktiviteKeys = {
  all: ["aktivite"] as const,
  list: (params: AktiviteListParams) => [...aktiviteKeys.all, params] as const,
}

export function useAktiviteList(params: AktiviteListParams) {
  return useQuery({
    queryKey: aktiviteKeys.list(params),
    queryFn: () => aktiviteApi.list(params),
    staleTime: 0,
  })
}
