/**
 * Mock kamu oturumu: GİB İnteraktif VD (e-Tebligat erişimiyle) ve SGK girişleri. e-Tebligat taraması
 * ve borç / levha sorguları aynı oturum açma yolunu kullanır. Doğrulama ekranı otomatik geçilmez:
 * giriş `DOGRULAMA` dönerse `KamuDogrulama` kaydı açılır, istenen adımlar kayda yazılır ve personel
 * kodu girene kadar o mükellef + kurum denenmez.
 */
import { addMinutes } from "date-fns"

import type {
  KamuKimlik,
  KamuOturum,
  KamuSorguAdapter,
} from "@prime/shared/borc/kamu-adapter"
import {
  DOGRULAMA_GECERLILIK_DK,
  KAMU_KURUM_ETIKET,
} from "@prime/shared/borc/sabitler"
import { db } from "@/mocks/db"
import { logActivity } from "@/mocks/handlers/common"
import { SISTEM_AKTOR } from "@/mocks/handlers/tahsilat"
import type { KamuDogrulamaView, KamuErisimDurumu } from "@prime/shared/types/api"
import type {
  KamuAdim,
  KamuDogrulama,
  KamuKurum,
  Mukellef,
} from "@prime/shared/types/domain"

export const gibErisimBul = (mukellefId: string) =>
  db.tebligatErisim.where((e) => e.mukellefId === mukellefId)[0]
export const sgkErisimBul = (mukellefId: string) =>
  db.sgkErisim.where((e) => e.mukellefId === mukellefId)[0]
export const dogrulamaBul = (mukellefId: string, kurum: KamuKurum) =>
  db.kamuDogrulama.where(
    (d) => d.mukellefId === mukellefId && d.kurum === kurum
  )[0]

/**
 * Mock backend'de şifre saklanmaz. Hatalı erişim, personel şifreyi güncelleyene kadar başarısız
 * kalsın diye adaptöre "hatali" verilir.
 */
export function kimlikBul(mukellefId: string, kurum: KamuKurum): KamuKimlik | null {
  if (kurum === "GIB") {
    const e = gibErisimBul(mukellefId)
    if (!e) return null
    return {
      kurum,
      kullaniciKodu: e.kullaniciKodu,
      sifre: e.durum === "HATA" ? "hatali" : "mock",
    }
  }
  const e = sgkErisimBul(mukellefId)
  if (!e) return null
  const sifre = e.durum === "HATA" ? "hatali" : "mock"
  return {
    kurum,
    kullaniciAdi: e.kullaniciAdi,
    isyeriKodu: e.isyeriKodu,
    sistemSifre: sifre,
    isyeriSifre: sifre,
  }
}

export function erisimDurumu(mukellefId: string, kurum: KamuKurum): KamuErisimDurumu {
  if (dogrulamaBul(mukellefId, kurum)) return "DOGRULAMA"
  const e =
    kurum === "GIB" ? gibErisimBul(mukellefId) : sgkErisimBul(mukellefId)
  if (!e) return "TANIMSIZ"
  return e.durum
}

export function dogrulamaView(d: KamuDogrulama): KamuDogrulamaView {
  const { oturumId: _gizli, ...geri } = d
  return {
    ...geri,
    mukellefUnvan: db.mukellef.find(d.mukellefId)?.unvan ?? "",
    suresiDoldu: new Date(d.sonGecerlilik) < new Date(),
  }
}

/** Giriş başarısız: erişim HATA'ya düşer, ilk düşüşte mükellef sorumlusuna bildirim gider */
export function erisimHatasi(
  m: Mukellef,
  kurum: KamuKurum,
  hataMesaji: string,
  aktorId: string
) {
  const e = kurum === "GIB" ? gibErisimBul(m.id) : sgkErisimBul(m.id)
  if (!e) return
  const ilkDusus = e.durum !== "HATA"
  if (kurum === "GIB")
    db.tebligatErisim.update(e.id, { durum: "HATA", hataMesaji })
  else db.sgkErisim.update(e.id, { durum: "HATA", hataMesaji })
  if (ilkDusus)
    logActivity(
      {
        aktorId,
        eylem: kurum === "GIB" ? "TEBLIGAT_ERISIM_HATASI" : "SGK_ERISIM_HATASI",
        hedefTip: "MUKELLEF",
        hedefId: m.id,
        mukellefId: m.id,
        aciklama: `${m.unvan} · ${hataMesaji}`,
      },
      {
        alicilar: [m.sorumluPersonelId],
        baslik: `${KAMU_KURUM_ETIKET[kurum]} girişi başarısız`,
      }
    )
}

export function dogrulamaAc(
  m: Mukellef,
  kurum: KamuKurum,
  oturumId: string,
  gorselDataUrl: string,
  adimlar: KamuAdim[],
  aktorId: string,
  an: Date
): KamuDogrulama {
  const d = db.kamuDogrulama.insert({
    mukellefId: m.id,
    kurum,
    oturumId,
    gorselDataUrl,
    sonGecerlilik: addMinutes(an, DOGRULAMA_GECERLILIK_DK).toISOString(),
    bekleyenAdimlar: [...new Set(adimlar)],
    olusturmaTarihi: an.toISOString(),
  })
  logActivity(
    {
      aktorId,
      eylem: "KAMU_DOGRULAMA_BEKLIYOR",
      hedefTip: "BORC",
      hedefId: d.id,
      mukellefId: m.id,
      aciklama: `${m.unvan} · ${KAMU_KURUM_ETIKET[kurum]}`,
    },
    // Personel kendisi tetiklediyse kodu zaten ekranda görür
    aktorId === SISTEM_AKTOR
      ? {
          alicilar: [m.sorumluPersonelId],
          baslik: `${KAMU_KURUM_ETIKET[kurum]} doğrulama kodu bekleniyor`,
        }
      : false
  )
  return d
}

export type OturumSonucu =
  { oturum: KamuOturum } | { dogrulama: KamuDogrulama } | { hata: string }

/**
 * Mükellef adına kuruma giriş yapar. Bekleyen doğrulama varsa yeniden denenmez; istenen adımlar
 * o kayda eklenir. Doğrulama ekranı çıkarsa kayıt açılır.
 */
export async function oturumAc(
  m: Mukellef,
  kurum: KamuKurum,
  adimlar: KamuAdim[],
  aktorId: string,
  adapter: KamuSorguAdapter,
  an: Date
): Promise<OturumSonucu> {
  const kimlik = kimlikBul(m.id, kurum)
  if (!kimlik)
    return {
      hata:
        kurum === "GIB"
          ? "GİB erişimi tanımlı değil (e-Tebligat erişimi kullanılır)"
          : "SGK erişimi tanımlı değil",
    }
  const e = kurum === "GIB" ? gibErisimBul(m.id) : sgkErisimBul(m.id)
  if (e?.durum === "HATA")
    return {
      hata: e.hataMesaji ?? `${KAMU_KURUM_ETIKET[kurum]} girişi başarısız`,
    }

  const bekleyen = dogrulamaBul(m.id, kurum)
  if (bekleyen) {
    const birlesik = [...new Set([...bekleyen.bekleyenAdimlar, ...adimlar])]
    return {
      dogrulama:
        db.kamuDogrulama.update(bekleyen.id, { bekleyenAdimlar: birlesik }) ??
        bekleyen,
    }
  }

  const sonuc = await adapter.giris(kimlik)
  if (sonuc.durum === "HATA") {
    erisimHatasi(m, kurum, sonuc.hataMesaji, aktorId)
    return { hata: sonuc.hataMesaji }
  }
  if (sonuc.durum === "DOGRULAMA")
    return {
      dogrulama: dogrulamaAc(
        m,
        kurum,
        sonuc.oturumId,
        sonuc.gorselDataUrl,
        adimlar,
        aktorId,
        an
      ),
    }
  return { oturum: sonuc.oturum }
}
