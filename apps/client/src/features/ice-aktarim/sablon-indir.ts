import type { SutunTanimi } from "@prime/shared/ice-aktarim/sutun-eslestir"
import { XLSX_MIME } from "@/features/fis-aktarimi/luca-excel"
import { dosyaIndir } from "@/lib/dosya"

/**
 * Boş şablon: ilk sayfada başlıklar ve bir örnek satır, ikinci sayfada sütun açıklamaları.
 * Başlıklar içe aktarımda tanınan adlardır; kullanıcı kendi dosyasının başlıklarını da bırakabilir.
 */
export async function sablonIndir(
  dosyaAdi: string,
  sutunlar: readonly SutunTanimi[]
) {
  const XLSX = await import("xlsx")
  const sayfa = XLSX.utils.aoa_to_sheet([
    sutunlar.map((s) => s.baslik),
    sutunlar.map((s) => s.ornek ?? ""),
  ])
  sayfa["!cols"] = sutunlar.map((s) => ({
    wch: Math.max(14, s.baslik.length + 2),
  }))
  const aciklama = XLSX.utils.aoa_to_sheet([
    ["Sütun", "Zorunlu", "Açıklama", "Kabul edilen diğer başlıklar"],
    ...sutunlar.map((s) => [
      s.baslik,
      s.zorunlu ? "Evet" : "",
      s.aciklama ?? "",
      (s.esAdlar ?? []).join(", "),
    ]),
  ])
  aciklama["!cols"] = [{ wch: 24 }, { wch: 8 }, { wch: 60 }, { wch: 60 }]
  const kitap = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(kitap, sayfa, "Veri")
  XLSX.utils.book_append_sheet(kitap, aciklama, "Açıklama")
  const veri = XLSX.write(kitap, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer
  dosyaIndir(new Blob([veri], { type: XLSX_MIME }), dosyaAdi)
}
