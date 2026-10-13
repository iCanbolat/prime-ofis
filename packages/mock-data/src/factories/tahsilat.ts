import type { Faker } from "@faker-js/faker"
import { addDays, format } from "date-fns"

import {
  fifoKapat,
  acikBorclar,
  odemeStopaji,
  ucretAnahtari,
  ucretBorcTarihi,
  ucretDonemleri,
  ucretHesapla,
  yuvarla,
} from "@prime/shared/tahsilat/kurallar"
import { formatDonem } from "@prime/shared/lib/format"
import { fromYmd, toYmd } from "@prime/shared/lib/tarih"
import type {
  CariHareket,
  KesintiIceAktarim,
  KesintiKaydi,
  Mukellef,
} from "@prime/shared/types/domain"

/** Seed referans günü (SEED_REF_DATE): borçlar bu aya kadar üretilir */
const REFERANS = "2026-09-01"
/** Ödemeler bu günden sonraya düşmez (e-Belge seed'i gibi "bugüne" yakın uzanır) */
const SON_ODEME = "2026-09-22"
/** Ücret geçmişi en fazla bu dönemden başlar (son 12 ay) */
const ILK_DONEM = "2025-10"
/** Kesinti listesi içe aktarılan yıl; İVD listesi bir ay geriden gelir */
const KESINTI_YILI = 2026
const KESINTI_SON_DONEM = "2026-07"

const EK_HIZMETLER = [
  "Şirket kuruluş işlemleri",
  "Ticaret sicil tadil tescili",
  "Yıllık gelir vergisi beyannamesi",
  "SGK işyeri tescili",
  "Vergi incelemesi danışmanlığı",
]

type Profil = "duzenli" | "gecikmeli" | "kronik"

type Yeni = Omit<CariHareket, "id">

export interface TahsilatSeed {
  cari: CariHareket[]
  kesintiAktarim: KesintiIceAktarim[]
  kesinti: KesintiKaydi[]
}

/**
 * Aktif mükelleflerin çoğuna aylık ücret, son 12 ayın borç/ödeme hareketleri (çoğu düzenli,
 * birkaç gecikmeli, 2–3 kronik borçlu) ve bu yılın İVD kesinti listesi (her durumdan örnekle).
 */
export function createTahsilatVerisi(
  faker: Faker,
  mukellefler: Mukellef[]
): TahsilatSeed {
  let sira = 0
  const id = () => `ch_${String(++sira).padStart(4, "0")}`
  const cari: CariHareket[] = []
  const ekle = (h: Yeni) => {
    const kayit = { ...h, id: id() }
    cari.push(kayit)
    return kayit
  }
  const olusturma = (tarih: string) => `${tarih}T09:00:00.000Z`

  const aktifler = mukellefler.filter((m) => m.aktif)
  const kronikler = new Set(
    faker.helpers.arrayElements(aktifler, 3).map((m) => m.id)
  )

  for (const m of aktifler) {
    if (!kronikler.has(m.id) && faker.number.float() < 0.12) continue
    const acilis = m.olusturmaTarihi.slice(0, 7)
    const baslangicDonem = acilis > ILK_DONEM ? acilis : ILK_DONEM
    if (baslangicDonem > REFERANS.slice(0, 7)) continue
    m.ucret = {
      aylikBrut: faker.number.int({ min: 6, max: 30 }) * 500,
      kdvOrani: 20,
      stopajVar: m.tur !== "SAHIS" || faker.number.float() < 0.8,
      baslangicDonem,
    }
    const t = ucretHesapla(m.ucret.aylikBrut, 20, m.ucret.stopajVar)
    const profil: Profil = kronikler.has(m.id)
      ? "kronik"
      : faker.number.float() < 0.18
        ? "gecikmeli"
        : "duzenli"

    const borclar = ucretDonemleri(m.ucret, REFERANS).map((donem) =>
      ekle({
        mukellefId: m.id,
        tip: "BORC",
        kalem: "AYLIK_UCRET",
        donem,
        tarih: ucretBorcTarihi(donem),
        brut: t.brut,
        kdv: t.kdv,
        stopaj: t.stopaj,
        tutar: t.net,
        aciklama: `${formatDonem(donem)} hizmet bedeli`,
        otomatikAnahtar: ucretAnahtari(m.id, donem),
        olusturanId: "sistem",
        olusturmaTarihi: olusturma(ucretBorcTarihi(donem)),
      })
    )

    if (faker.number.float() < 0.15) {
      const tarih = faker.helpers.arrayElement(borclar).tarih
      const brut = faker.number.int({ min: 4, max: 20 }) * 500
      const e = ucretHesapla(brut, 20, m.ucret.stopajVar)
      borclar.push(
        ekle({
          mukellefId: m.id,
          tip: "BORC",
          kalem: "EK_HIZMET",
          tarih: toYmd(addDays(fromYmd(tarih), 9)),
          brut: e.brut,
          kdv: e.kdv,
          stopaj: e.stopaj,
          tutar: e.net,
          aciklama: faker.helpers.arrayElement(EK_HIZMETLER),
          olusturanId: "p_1",
          olusturmaTarihi: olusturma(toYmd(addDays(fromYmd(tarih), 9))),
        })
      )
      borclar.sort((a, b) => a.tarih.localeCompare(b.tarih))
    }

    // Kronik borçlu son 3–5 ayı ödemedi; gecikmeli her borcu 1–2 ay geç öder
    const odenmeyenSon =
      profil === "kronik" ? faker.number.int({ min: 3, max: 5 }) : 0
    for (const [i, b] of borclar.entries()) {
      if (i >= borclar.length - odenmeyenSon) break
      const gecikme =
        profil === "gecikmeli"
          ? faker.number.int({ min: 30, max: 65 })
          : faker.number.int({ min: 3, max: 22 })
      const tarih = toYmd(addDays(fromYmd(b.tarih), gecikme))
      if (tarih > SON_ODEME) continue
      const acik = acikBorclar(cari.filter((h) => h.mukellefId === m.id))
      const hedef = acik.find((a) => a.id === b.id)
      if (!hedef) continue
      ekle({
        mukellefId: m.id,
        tip: "ODEME",
        kalem: "ODEME",
        tarih,
        brut: 0,
        kdv: 0,
        stopaj: 0,
        tutar: hedef.kalan,
        aciklama: faker.helpers.arrayElement(["Havale", "EFT", "Nakit"]),
        makbuzNo:
          faker.number.float() < 0.6
            ? `SMM${tarih.slice(0, 4)}${String(sira).padStart(6, "0")}`
            : undefined,
        kapatmalar: fifoKapat(hedef.kalan, [hedef]),
        olusturanId: faker.helpers.arrayElement(["p_1", "p_2", "p_3"]),
        olusturmaTarihi: olusturma(tarih),
      })
    }
  }

  // Bir mükellefe indirim (alacak düzeltmesi)
  const indirimli = cari.find(
    (h) => h.kalem === "AYLIK_UCRET" && h.donem === "2026-08"
  )
  if (indirimli) {
    const acik = acikBorclar(
      cari.filter((h) => h.mukellefId === indirimli.mukellefId)
    ).filter((b) => b.id === indirimli.id)
    if (acik.length) {
      const tutar = yuvarla(indirimli.tutar * 0.1)
      ekle({
        mukellefId: indirimli.mukellefId,
        tip: "ODEME",
        kalem: "DUZELTME",
        tarih: "2026-08-20",
        brut: 0,
        kdv: 0,
        stopaj: 0,
        tutar,
        aciklama: "Yıllık peşin anlaşma indirimi",
        kapatmalar: fifoKapat(tutar, acik),
        olusturanId: "p_1",
        olusturmaTarihi: olusturma("2026-08-20"),
      })
    }
  }

  return { cari, ...kesintiListesi(faker, mukellefler, cari) }
}

/**
 * Ödemelerden beklenen stopajla tutarlı İVD listesi; karşılaştırma ekranında her durum
 * görünsün diye birkaç satır bozulur: eksik, fazla, bildirilmemiş ve kayıtsız.
 */
function kesintiListesi(
  faker: Faker,
  mukellefler: Mukellef[],
  cari: CariHareket[]
): Pick<TahsilatSeed, "kesintiAktarim" | "kesinti"> {
  const borclar = new Map(
    cari.filter((h) => h.tip === "BORC").map((h) => [h.id, h])
  )
  const mukellefMap = new Map(mukellefler.map((m) => [m.id, m]))
  const hucreler = new Map<string, Omit<KesintiKaydi, "id" | "iceAktarimId">>()
  for (const h of cari) {
    if (h.tip !== "ODEME" || h.kalem !== "ODEME") continue
    const donem = h.tarih.slice(0, 7)
    if (!h.tarih.startsWith(`${KESINTI_YILI}-`) || donem > KESINTI_SON_DONEM)
      continue
    const stopaj = odemeStopaji(h, borclar)
    const m = mukellefMap.get(h.mukellefId)
    if (stopaj <= 0 || !m) continue
    const anahtar = `${m.id}:${donem}`
    const c = hucreler.get(anahtar) ?? {
      vkn: (m.vkn ?? m.tckn)!,
      unvan: m.unvan,
      donem,
      matrah: 0,
      kesinti: 0,
    }
    c.matrah = yuvarla(c.matrah + stopaj / 0.2)
    c.kesinti = yuvarla(c.kesinti + stopaj)
    hucreler.set(anahtar, c)
  }

  const satirlar = [...hucreler.values()]
  const [eksik, fazla, bildirilmemis] = faker.helpers.arrayElements(
    satirlar.map((_, i) => i),
    3
  )
  if (eksik !== undefined) {
    const s = satirlar[eksik]!
    s.kesinti = yuvarla(s.kesinti / 2)
    s.matrah = yuvarla(s.matrah / 2)
  }
  if (fazla !== undefined) {
    const s = satirlar[fazla]!
    s.kesinti = yuvarla(s.kesinti + 400)
    s.matrah = yuvarla(s.matrah + 2000)
  }
  const kalan = satirlar.filter((_, i) => i !== bildirilmemis)
  const ucretsiz = mukellefler.find((m) => m.aktif && !m.ucret)
  if (ucretsiz)
    kalan.push({
      vkn: (ucretsiz.vkn ?? ucretsiz.tckn)!,
      unvan: ucretsiz.unvan,
      donem: "2026-05",
      matrah: 3000,
      kesinti: 600,
    })

  const aktarim: KesintiIceAktarim = {
    id: "ki_1",
    yil: KESINTI_YILI,
    dosyaAdi: "hakkimda-yapilan-kesintiler-2026.xlsx",
    satirSayisi: kalan.length,
    yukleyenId: "p_1",
    zaman: `${format(fromYmd("2026-08-25"), "yyyy-MM-dd")}T10:30:00.000Z`,
  }
  return {
    kesintiAktarim: [aktarim],
    kesinti: kalan.map((k, i) => ({
      ...k,
      id: `ks_${String(i + 1).padStart(4, "0")}`,
      iceAktarimId: aktarim.id,
    })),
  }
}
