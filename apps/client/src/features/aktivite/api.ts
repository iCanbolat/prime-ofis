import { http } from "@/lib/http"
import type { AktiviteKaydi, AktiviteListParams } from "@prime/shared/types/api"

export const aktiviteApi = {
  list: ({ eylem, ...params }: AktiviteListParams) =>
    http.get<AktiviteKaydi[]>("/aktivite", {
      params: { ...params, eylem: eylem?.join(",") },
    }),
}
