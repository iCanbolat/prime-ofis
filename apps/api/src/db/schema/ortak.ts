import { customType } from "drizzle-orm/pg-core"

/**
 * ISO zaman: `timestamptz`, JS tarafında ISO metin (`2026-09-23T07:00:00.000Z`). Drizzle'ın
 * `mode: "string"` seçeneği Postgres'in kendi biçimini ("2026-09-23 10:00:00+03") döndürür;
 * client ISO beklediği için dönüştürülür.
 */
export const zaman = customType<{ data: string; driverData: string | Date }>({
  dataType: () => "timestamp with time zone",
  fromDriver: (v) => new Date(v).toISOString(),
  toDriver: (v) => v,
})
