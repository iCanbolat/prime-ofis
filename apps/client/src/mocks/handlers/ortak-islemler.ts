/**
 * Birden fazla handler'ın kullandığı veri işlemleri (HTTP katmanından bağımsız).
 */
import { putBlob } from "@/mocks/blob-store"
import { db } from "@/mocks/db"
import type { IceAktarDosya } from "@prime/shared/types/api"
import type { ArsivDosya, ArsivKategori, Personel } from "@prime/shared/types/domain"

export const DATA_URL_RE = /^data:([\w/+.-]+);base64,/

/** Dosyayı arşive kaydeder (içerik blob-store'a yazılır); arşiv kaydının id'sini döner. */
export async function arsiveYaz(
  mukellefId: string,
  kategori: ArsivKategori,
  dosya: IceAktarDosya,
  actor: Personel,
  ek: Pick<ArsivDosya, "donem" | "bordroBelge"> = {}
) {
  const mimeType = DATA_URL_RE.exec(dosya.dataUrl)?.[1] ?? "application/pdf"
  const kayit = db.arsiv.insert({
    mukellefId,
    kategori,
    ad: dosya.ad,
    mimeType,
    boyut: Math.round(
      ((dosya.dataUrl.length - dosya.dataUrl.indexOf(",")) * 3) / 4
    ),
    yukleyenId: actor.id,
    yuklemeTarihi: new Date().toISOString(),
    silindi: false,
    ...ek,
  })
  await putBlob(kayit.id, dosya.dataUrl)
  return kayit.id
}

/**
 * Otomatik üretilen görevde (id = takvim olay id'si) verilen metindeki işaretlenmemiş checklist
 * maddesini tamamlar. Görev veya madde yoksa / zaten tamamsa bir şey yapmaz.
 */
export function gorevMaddesiniTamamla(
  otomatikAnahtar: string,
  metin: string,
  actor: Personel
): string | undefined {
  const gorev = db.gorev.where((g) => g.otomatikAnahtar === otomatikAnahtar)[0]
  const madde = gorev?.checklist.find((c) => c.metin === metin && !c.tamam)
  if (!gorev || !madde) return
  const simdi = new Date().toISOString()
  db.gorev.update(gorev.id, {
    checklist: gorev.checklist.map((c) =>
      c.id === madde.id
        ? { ...c, tamam: true, tamamlayanId: actor.id, tamamlanmaTarihi: simdi }
        : c
    ),
    guncellemeTarihi: simdi,
  })
  return gorev.id
}
