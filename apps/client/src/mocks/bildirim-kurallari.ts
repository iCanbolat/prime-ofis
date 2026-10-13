/**
 * Aktivite → bildirim kuralları. Hangi eylemin bildirim ürettiği, başlığı, bağlantısı ve alıcısı
 * burada belirlenir. Alıcı kuralı: olayın atananı (görev atananı → talebi oluşturan → mükellef
 * sorumlusu); atanan yoksa tüm kullanıcılara yayın. Aktör kendi eylemi için bildirim almaz.
 */
import {
  BILDIRIM_BASLIKLARI,
  bildirimGorunurMu,
  bildirimLinki as linkKurali,
  type BildirimSecenekleri,
} from "@prime/shared/bildirim/kurallar"
import { db } from "@/mocks/db"
import { bildirimGonderimleri } from "@/mocks/gonderim"
import type { AktiviteLog, Bildirim } from "@prime/shared/types/domain"

/** Bağlantı: bildirime tıklanınca açılacak uygulama içi yol (kural shared'de, bağlam mock DB'den) */
export function bildirimLinki(
  log: Pick<AktiviteLog, "eylem" | "hedefTip" | "hedefId" | "mukellefId">
): string | undefined {
  const { hedefTip, hedefId } = log
  return linkKurali(log, {
    talepId:
      hedefTip === "EVRAK" && hedefId
        ? db.gelen.find(hedefId)?.talepId
        : undefined,
    eArsiv:
      hedefTip === "EBELGE" && hedefId
        ? db.ebelge.find(hedefId)?.tur === "E_ARSIV"
        : undefined,
  })
}

/** Olayın atananı; yoksa `null` (yayın). */
export function aliciBul(log: AktiviteLog): string | null {
  if (log.hedefTip === "GOREV" && log.hedefId) {
    const g = db.gorev.find(log.hedefId)
    if (g) return g.atananId
  }
  if (log.hedefTip === "TEBLIGAT" && log.hedefId) {
    const t = db.tebligat.find(log.hedefId)
    if (t?.atananId) return t.atananId
  }
  if (log.hedefTip === "EVRAK" && log.hedefId) {
    const talepId = db.gelen.find(log.hedefId)?.talepId ?? log.hedefId
    const t = db.talep.find(talepId)
    if (t) return t.olusturanId
  }
  if (log.mukellefId) {
    const m = db.mukellef.find(log.mukellefId)
    if (m) return m.sorumluPersonelId
  }
  return null
}

export type { BildirimSecenekleri }

/** Aktivite kaydından bildirim(ler) üretir. `logActivity` her kayıttan sonra çağırır. */
export function bildirimUret(
  log: AktiviteLog,
  secenek: BildirimSecenekleri = {}
): Bildirim[] {
  const baslik = secenek.baslik ?? BILDIRIM_BASLIKLARI[log.eylem]
  if (!baslik) return []

  const alicilar = secenek.alicilar ?? [aliciBul(log)]
  const ortak = {
    tur: secenek.tur ?? log.eylem,
    aktorId: log.aktorId,
    baslik,
    aciklama: log.aciklama,
    link: bildirimLinki(log),
    mukellefId: log.mukellefId,
    hedefTip: log.hedefTip,
    hedefId: log.hedefId,
    zaman: log.zaman,
  }

  const eklenen = alicilar.flatMap((aliciId) => {
    // Kişiye özel bildirimde aktör kendine bildirim göndermez
    if (aliciId !== null && aliciId === log.aktorId) return []
    return [
      db.bildirim.insert({
        ...ortak,
        aliciId,
        // Yayında aktör baştan "okumuş" sayılır; listede zaten görünmez
        okuyanlar: aliciId === null ? [log.aktorId] : [],
      }),
    ]
  })
  // Tercihe göre e-posta / Telegram / WhatsApp
  db.gonderim.insertMany(eklenen.flatMap(bildirimGonderimleri))
  return eklenen
}

export { bildirimGorunurMu }
