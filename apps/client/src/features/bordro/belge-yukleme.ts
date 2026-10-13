/** Bordro dönem belgelerinin istemci tarafı hazırlığı (seçilen dosya → yükleme gövdesi). */
import { bordroBelgeTahmini } from "@prime/shared/bordro/kurallar"
import { dataUrlOku } from "@/lib/dosya"
import type { BordroBelgeYukleme } from "@prime/shared/types/api"
import type { BordroBelgeTur } from "@prime/shared/types/domain"

/** Bordro belgeleri: muhasebe paketi çıktıları (Excel / CSV / PDF) ve taranmış belgeler */
export const BORDRO_BELGE_ACCEPT = ".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png"

export interface YuklenecekBelge {
  key: string
  dosya: File
  tur: BordroBelgeTur
}

let sayac = 0

/** Seçilen dosyaları ad tahminiyle türlendirir */
export function belgelereCevir(
  files: File[],
  varsayilan?: BordroBelgeTur
): YuklenecekBelge[] {
  return files.map((dosya) => ({
    key: `b${++sayac}`,
    dosya,
    tur: varsayilan ?? bordroBelgeTahmini(dosya.name),
  }))
}

export async function yuklemeyeCevir(
  belgeler: YuklenecekBelge[]
): Promise<BordroBelgeYukleme[]> {
  return Promise.all(
    belgeler.map(async (b) => ({
      tur: b.tur,
      dosya: { ad: b.dosya.name, dataUrl: await dataUrlOku(b.dosya) },
    }))
  )
}
