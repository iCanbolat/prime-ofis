import type { Faker } from "@faker-js/faker"
import { addDays, subDays } from "date-fns"

import { otomatikGorevBasligi } from "@prime/shared/gorev/kurallar"
import { CHECKLIST_SABLONLARI } from "@prime/shared/gorev/sabitler"
import { takvimOlayId, yukumlulukleriHesapla } from "@prime/shared/takvim/motor"
import { fromYmd, toYmd } from "@prime/shared/lib/tarih"
import type {
  Gorev,
  GorevChecklistMaddesi,
  GorevDurum,
  GorevOncelik,
  GorevYorum,
  Mukellef,
  TakvimDurumKaydi,
} from "@prime/shared/types/domain"

/** Seed referans günü (SEED_REF_DATE ile aynı gün) */
const REFERANS = "2026-09-01"
/** Otomatik görevlerin üretildiği son gün aralığı */
const OTOMATIK_ARALIK = { baslangic: "2026-08-20", bitis: "2026-09-30" }

const SERBEST_GOREVLER: { baslik: string; checklist: string[] }[] = [
  {
    baslik: "SGK işe giriş bildirgesi",
    checklist: ["Kimlik ve adres alındı", "Bildirge verildi"],
  },
  {
    baslik: "Ticaret sicil adres değişikliği",
    checklist: ["Kira sözleşmesi alındı", "Karar yazıldı", "Tescil başvurusu"],
  },
  { baslik: "Banka mutabakatı", checklist: ["Ekstreler alındı", "Mutabakat"] },
  { baslik: "Vergi levhası güncelleme", checklist: [] },
  {
    baslik: "Yoklama fişi itirazı",
    checklist: ["Belgeler toplandı", "Dilekçe verildi"],
  },
  { baslik: "Kira stopajı kontrolü", checklist: [] },
  {
    baslik: "Ortaklar kurulu toplantı tutanağı",
    checklist: ["Taslak hazırlandı", "İmzalar alındı"],
  },
  { baslik: "Borç durum yazısı alınması", checklist: [] },
  {
    baslik: "e-Fatura başvurusu",
    checklist: ["Mali mühür", "Entegratör sözleşmesi", "GİB başvurusu"],
  },
  { baslik: "Müşteri ile yıl sonu görüşmesi", checklist: [] },
  {
    baslik: "SGK işten çıkış bildirgesi",
    checklist: ["Kıdem hesabı", "Bildirge verildi"],
  },
  { baslik: "Demirbaş listesi güncelleme", checklist: [] },
]

const YORUMLAR = [
  "Müşteriden faturalar bekleniyor, yarın tekrar arayacağım.",
  "Tahakkuk müşteriye WhatsApp'tan iletildi.",
  "Banka ekstresi eksik, evrak talebi gönderildi.",
  "Kontrol ettim, bir düzeltme gerekiyor.",
  "Müşteri onay verdi.",
]

function checklist(
  gorevId: string,
  metinler: string[],
  tamamSayisi: number,
  tamamlayanId: string,
  tarih: string
): GorevChecklistMaddesi[] {
  return metinler.map((metin, i) => ({
    id: `${gorevId}_c${i + 1}`,
    metin,
    tamam: i < tamamSayisi,
    ...(i < tamamSayisi ? { tamamlayanId, tamamlanmaTarihi: tarih } : {}),
  }))
}

/** Duruma uygun tamamlanmış madde sayısı */
function tamamSayisi(faker: Faker, durum: GorevDurum, toplam: number) {
  if (toplam === 0) return 0
  switch (durum) {
    case "YAPILACAK":
      return faker.number.int({ min: 0, max: Math.min(1, toplam - 1) })
    case "DEVAM":
      return faker.number.int({ min: 1, max: Math.max(1, toplam - 2) })
    case "KONTROL":
      return toplam - 1
    case "TAMAM":
      return toplam
  }
}

function yorumlar(
  faker: Faker,
  gorevId: string,
  personelIds: string[],
  tarih: string
): GorevYorum[] {
  if (faker.number.float() > 0.2) return []
  return Array.from(
    { length: faker.number.int({ min: 1, max: 2 }) },
    (_, i) => ({
      id: `${gorevId}_y${i + 1}`,
      yazarId: faker.helpers.arrayElement(personelIds),
      metin: faker.helpers.arrayElement(YORUMLAR),
      bahsedilenler: [],
      zaman: addDays(fromYmd(tarih), i).toISOString(),
    })
  )
}

/**
 * ~120 görev: yakın son günlü yükümlülükler için otomatik görevler (durumları takvim kaydıyla
 * tutarlı) + serbest görevler. Bir kısmı gecikmiş, bazılarında yorum var.
 */
export function createGorevler(
  faker: Faker,
  mukellefler: Mukellef[],
  takvim: TakvimDurumKaydi[],
  personelIds: string[]
): Gorev[] {
  const durumlar = new Map(takvim.map((t) => [t.id, t.durum]))
  const gorevler: Gorev[] = []
  const aktifler = mukellefler.filter((m) => m.aktif)
  const yeniId = () => `o_${String(gorevler.length + 1).padStart(3, "0")}`

  for (const m of aktifler) {
    for (const y of yukumlulukleriHesapla(m, OTOMATIK_ARALIK)) {
      if (y.tip === "E_DEFTER_BERAT" || y.tip === "BA_BS") continue
      const id = yeniId()
      const anahtar = takvimOlayId(m.id, y.tip, y.donem)
      const beyan = durumlar.get(anahtar)
      const durum: GorevDurum =
        beyan === "ONAYLANDI"
          ? "TAMAM"
          : beyan === "HAZIRLANDI"
            ? "KONTROL"
            : y.sonTarih < REFERANS
              ? "DEVAM"
              : faker.helpers.weightedArrayElement([
                  { value: "YAPILACAK" as const, weight: 6 },
                  { value: "DEVAM" as const, weight: 4 },
                ])
      const metinler = CHECKLIST_SABLONLARI[y.tip]
      const olusturma = subDays(fromYmd(y.sonTarih), 20).toISOString()
      const guncelleme = subDays(
        fromYmd(y.sonTarih),
        faker.number.int({ min: 1, max: 8 })
      ).toISOString()
      gorevler.push({
        id,
        baslik: otomatikGorevBasligi(y.tip, y.donem),
        mukellefId: m.id,
        tip: y.tip,
        donem: y.donem,
        atananId: m.sorumluPersonelId,
        durum,
        oncelik: y.tip === "KDV" ? "YUKSEK" : "NORMAL",
        sonTarih: y.sonTarih,
        checklist: checklist(
          id,
          metinler,
          tamamSayisi(faker, durum, metinler.length),
          m.sorumluPersonelId,
          guncelleme
        ),
        yorumlar: yorumlar(faker, id, personelIds, olusturma.slice(0, 10)),
        bagliTalepIdler: [],
        olusturanId: personelIds[0]!,
        olusturmaTarihi: olusturma,
        guncellemeTarihi: guncelleme,
        tamamlanmaTarihi: durum === "TAMAM" ? guncelleme : undefined,
        otomatikAnahtar: anahtar,
      })
    }
  }

  for (let i = 0; i < 20; i++) {
    const id = yeniId()
    const m = faker.helpers.arrayElement(aktifler)
    const sablon = SERBEST_GOREVLER[i % SERBEST_GOREVLER.length]!
    const sonTarih = toYmd(
      addDays(fromYmd(REFERANS), faker.number.int({ min: -10, max: 40 }))
    )
    const durum = faker.helpers.arrayElement<GorevDurum>([
      "YAPILACAK",
      "YAPILACAK",
      "DEVAM",
      "KONTROL",
      "TAMAM",
    ])
    const atananId =
      faker.helpers.maybe(() => m.sorumluPersonelId, {
        probability: 0.7,
      }) ?? faker.helpers.arrayElement(personelIds)
    const olusturma = subDays(
      fromYmd(REFERANS),
      faker.number.int({ min: 1, max: 20 })
    )
    gorevler.push({
      id,
      baslik: sablon.baslik,
      aciklama: faker.helpers.maybe(
        () => "Müşteri telefonda bilgi verdi, gerekli evraklar istenecek.",
        { probability: 0.4 }
      ),
      mukellefId: m.id,
      tip: "DIGER",
      atananId,
      durum,
      oncelik: faker.helpers.arrayElement<GorevOncelik>([
        "DUSUK",
        "NORMAL",
        "NORMAL",
        "YUKSEK",
      ]),
      sonTarih,
      checklist: checklist(
        id,
        sablon.checklist,
        tamamSayisi(faker, durum, sablon.checklist.length),
        atananId,
        olusturma.toISOString()
      ),
      yorumlar: yorumlar(faker, id, personelIds, toYmd(olusturma)),
      bagliTalepIdler: [],
      olusturanId: faker.helpers.arrayElement(personelIds),
      olusturmaTarihi: olusturma.toISOString(),
      guncellemeTarihi: olusturma.toISOString(),
      tamamlanmaTarihi: durum === "TAMAM" ? olusturma.toISOString() : undefined,
    })
  }

  return gorevler
}
