/**
 * Bordro kayıtları üzerinde HTTP'den bağımsız veri işlemleri. `handlers/bordro.ts` ve diğer
 * handler'lar (ör. gelen evrak onayı → puantaj geldi) aynı kuralları buradan kullanır.
 */
import {
  BORDRO_BELGE_SIRASI,
  BORDRO_DURUM_SIRASI,
  bordroKayitId,
  bordroSonTarih,
  bordroUygulanirMi,
  bordroUyari,
  kalanIsGunu,
} from "@prime/shared/bordro/kurallar"
import {
  hareketSonTarih,
  hareketUyari,
} from "@prime/shared/bordro/hareket-kurallari"
import { BORDRO_DURUM_ETIKET } from "@prime/shared/bordro/sabitler"
import { talepDurumu } from "@prime/shared/evrak-talebi/durum"
import { donemEtiketi, takvimOlayId } from "@prime/shared/takvim/motor"
import { bugun } from "@prime/shared/lib/tarih"
import { db } from "@/mocks/db"
import { logActivity, turkishIncludes } from "@/mocks/handlers/common"
import { beyanDurumuOku } from "@/mocks/handlers/takvim"
import type { BordroBelgesi, BordroSatiri, IsHareketiView } from "@prime/shared/types/api"
import type {
  AktiviteEylem,
  BordroDonemi,
  BordroSaklananDurum,
  IsHareketi,
  Mukellef,
  Personel,
} from "@prime/shared/types/domain"

export interface BordroMukellefFiltre {
  sorumlu?: string | null
  q?: string | null
  mukellefId?: string | null
}

/** Bordrosu olan aktif mükellefler (çalışan sayısı > 0 veya SGK işyeri kaydı var) */
export function bordroMukellefleri(f: BordroMukellefFiltre = {}): Mukellef[] {
  return db.mukellef.where(
    (m) =>
      bordroUygulanirMi(m) &&
      (!f.mukellefId || m.id === f.mukellefId) &&
      (!f.sorumlu || m.sorumluPersonelId === f.sorumlu) &&
      (!f.q || turkishIncludes(m.unvan, f.q))
  )
}

/** MUHSGK beyanı takvimde "Onaylandı" ise bordro dönemi tamamlanmıştır */
export function beyanVerildiMi(mukellefId: string, donem: string): boolean {
  return (
    beyanDurumuOku(takvimOlayId(mukellefId, "MUHTASAR_SGK", donem)) ===
    "ONAYLANDI"
  )
}

export function bordroSatiri(
  m: Mukellef,
  donem: string,
  bugunYmd: string = bugun()
): BordroSatiri {
  const kayit = db.bordro.find(bordroKayitId(m.id, donem))
  const durum = beyanVerildiMi(m.id, donem)
    ? "BEYAN_VERILDI"
    : (kayit?.durum ?? "BEKLENIYOR")
  const sonTarih = bordroSonTarih(donem)
  const talep = kayit?.girdiTalepId
    ? db.talep.find(kayit.girdiTalepId)
    : undefined

  return {
    mukellefId: m.id,
    mukellefUnvan: m.unvan,
    sorumluPersonelId: m.sorumluPersonelId,
    donem,
    durum,
    sonTarih,
    kalanIsGunu: kalanIsGunu(bugunYmd, sonTarih),
    uyari: bordroUyari(durum, sonTarih, bugunYmd),
    calisanSayisi: m.calisanSayisi,
    ozet: kayit?.ozet,
    girdiTalepId: kayit?.girdiTalepId,
    girdiTalepDurum: talep ? talepDurumu(talep) : undefined,
    degisiklikYok: kayit?.degisiklikYok,
    not: kayit?.not,
    guncellemeTarihi: kayit?.guncellemeTarihi,
  }
}

type BordroDegisimi = Partial<
  Pick<
    BordroDonemi,
    "durum" | "not" | "girdiTalepId" | "ozet" | "degisiklikYok"
  >
>

/** Kaydı yazan: personel ya da portaldaki müşteri (`MUSTERI_AKTOR_ID`) */
type Yazan = Pick<Personel, "id">

/** Kaydı oluşturur / günceller ve aktiviteye yazar (bildirim üretmez). */
export function bordroKaydiYaz(
  mukellefId: string,
  donem: string,
  degisim: BordroDegisimi,
  actor: Yazan,
  eylem: AktiviteEylem = "BORDRO_GUNCELLENDI",
  aciklama?: string
): BordroDonemi {
  const id = bordroKayitId(mukellefId, donem)
  const ortak = {
    ...degisim,
    guncelleyenId: actor.id,
    guncellemeTarihi: new Date().toISOString(),
  }
  const mevcut = db.bordro.find(id)
  const kayit = mevcut
    ? db.bordro.update(id, ortak)!
    : db.bordro.insert({
        id,
        mukellefId,
        donem,
        durum: "BEKLENIYOR",
        ...ortak,
      })

  logActivity(
    {
      aktorId: actor.id,
      eylem,
      hedefTip: "BORDRO",
      hedefId: id,
      mukellefId,
      aciklama:
        aciklama ??
        `${donemEtiketi(donem)}: ${BORDRO_DURUM_ETIKET[kayit.durum]}`,
    },
    false
  )
  return kayit
}

/**
 * Durumu yalnızca ileri taşır (ör. puantaj geldi → "Girdi geldi"); zaten ilerideyse dokunmaz.
 * Aktivite yalnızca durum gerçekten değişince yazılır.
 */
export function bordroDurumuIlerlet(
  mukellefId: string,
  donem: string,
  hedef: BordroSaklananDurum,
  actor: Yazan,
  ek: BordroDegisimi = {}
): BordroDonemi | undefined {
  const mevcut = db.bordro.find(bordroKayitId(mukellefId, donem))
  const simdiki = mevcut?.durum ?? "BEKLENIYOR"
  if (
    BORDRO_DURUM_SIRASI.indexOf(simdiki) >= BORDRO_DURUM_SIRASI.indexOf(hedef)
  )
    return mevcut
  return bordroKaydiYaz(mukellefId, donem, { ...ek, durum: hedef }, actor)
}

/**
 * Dönemin arşivdeki belgeleri: kayıtta ID tutulmaz, arşivden `donem` + `bordroBelge` ile
 * sorgulanır. Böylece portaldan gelen imzalı bordro / dekont da kendiliğinden döneme bağlanır.
 */
export function bordroBelgeleri(
  mukellefId: string,
  donem: string
): BordroBelgesi[] {
  return db.arsiv
    .where(
      (d) =>
        d.mukellefId === mukellefId &&
        d.donem === donem &&
        Boolean(d.bordroBelge) &&
        !d.silindi
    )
    .sort(
      (a, b) =>
        BORDRO_BELGE_SIRASI.indexOf(a.bordroBelge!) -
          BORDRO_BELGE_SIRASI.indexOf(b.bordroBelge!) ||
        a.yuklemeTarihi.localeCompare(b.yuklemeTarihi)
    )
    .map((d) => ({
      id: d.id,
      ad: d.ad,
      mimeType: d.mimeType,
      boyut: d.boyut,
      tur: d.bordroBelge!,
      yuklemeTarihi: d.yuklemeTarihi,
    }))
}

export function hareketView(
  h: IsHareketi,
  bugunYmd: string = bugun()
): IsHareketiView {
  const sonTarih = hareketSonTarih(h.tur, h.tarih)
  return {
    ...h,
    mukellefUnvan: db.mukellef.find(h.mukellefId)?.unvan ?? "—",
    sonTarih,
    kalanIsGunu: kalanIsGunu(bugunYmd, sonTarih),
    uyari: hareketUyari(h.durum, sonTarih, bugunYmd),
  }
}
