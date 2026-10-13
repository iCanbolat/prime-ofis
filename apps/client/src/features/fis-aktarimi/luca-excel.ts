import { lucaSatirlari } from "@prime/shared/fis-aktarimi/kurallar"
import type { LucaSablonAyari, MuhasebeFisi } from "@prime/shared/types/domain"

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/**
 * Luca "Excel Veri Aktarımı" dosyası: tek sayfa, ilk satır başlıklar. Tutarlar sayı hücresi
 * (Excel'de ondalık ayırıcıyı Luca doğru okur), tarihler şablondaki biçimde metin olarak yazılır.
 */
export async function lucaExcelOlustur(
  fisler: Pick<
    MuhasebeFisi,
    "tarih" | "aciklama" | "evrakNo" | "evrakTarihi" | "satirlar"
  >[],
  sablon: LucaSablonAyari
): Promise<Blob> {
  const XLSX = await import("xlsx")
  const sayfa = XLSX.utils.aoa_to_sheet(lucaSatirlari(fisler, sablon))
  sayfa["!cols"] = sablon.sutunlar.map((s) => ({
    wch: s.alan.endsWith("ACIKLAMA") ? 40 : 14,
  }))
  const kitap = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(kitap, sayfa, "Fisler")
  const veri = XLSX.write(kitap, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer
  return new Blob([veri], { type: XLSX_MIME })
}
