/**
 * Fiş aktarımı seed verisi: onaylanmış fiş / ekstre evraklarının okunmuş hali. Faker kullanmaz
 * (okuyucu gelen id'sinden kendi tohumunu üretir), bu yüzden seed'in faker sırasını etkilemez.
 */
import { fisHatalari } from "@prime/shared/fis-aktarimi/kurallar"
import { varsayilanHesapAyari } from "@prime/shared/fis-aktarimi/sabitler"
import {
  belgeDonemi,
  fisAktarimiDestekli,
  okumaBaslat,
  okumaSonuclandir,
  okumaTuru,
} from "../okuyucu/fis-uret"
import type {
  BelgeOkuma,
  EBelge,
  EvrakTalebi,
  FisOkumasi,
  GelenEvrak,
  Mukellef,
  MuhasebeFisi,
} from "@prime/shared/types/domain"

/** Demo: ilk birkaç bilanço mükellefinin Ağustos fiş / ekstre talebi tamamlanmış olsun */
const DEMO_MUKELLEF = 3
const DEMO_DOSYALAR: Pick<GelenEvrak, "istenen" | "ad" | "mimeType">[] = [
  { istenen: "FIS_FATURA", ad: "fis-01.jpg", mimeType: "image/jpeg" },
  { istenen: "FIS_FATURA", ad: "fis-02.jpg", mimeType: "image/jpeg" },
  { istenen: "FIS_FATURA", ad: "fis-03.pdf", mimeType: "application/pdf" },
  {
    istenen: "BANKA_EKSTRESI",
    ad: "ekstre-agustos.pdf",
    mimeType: "application/pdf",
  },
]

function demoTalepleri(
  mukellefler: Mukellef[],
  personelId: string
): { talep: EvrakTalebi[]; gelen: GelenEvrak[] } {
  const talep: EvrakTalebi[] = []
  const gelen: GelenEvrak[] = []
  mukellefler
    .filter((m) => m.aktif && fisAktarimiDestekli(m))
    .slice(0, DEMO_MUKELLEF)
    .forEach((m, i) => {
      const id = `e_fis_${i + 1}`
      const olusturma = `2026-09-0${2 + i}T09:00:00.000Z`
      const inceleme = `2026-09-0${4 + i}T14:00:00.000Z`
      talep.push({
        id,
        mukellefId: m.id,
        token: `demo${id}`.padEnd(43, "0"),
        kanal: "LINK",
        istenenler: ["FIS_FATURA", "BANKA_EKSTRESI"],
        donem: "2026-08",
        durum: "TAMAMLANDI",
        sonKullanma: `2026-09-1${i}T20:59:59.000Z`,
        olusturanId: personelId,
        olusturmaTarihi: olusturma,
        gonderimler: [],
        tamamlanmaTarihi: `2026-09-0${3 + i}T18:00:00.000Z`,
      })
      // Son mükellefin bir fişi bulanık: okuma hatası örneği
      const dosyalar =
        i === DEMO_MUKELLEF - 1
          ? [
              ...DEMO_DOSYALAR,
              {
                istenen: "FIS_FATURA" as const,
                ad: "fis-bulanik.jpg",
                mimeType: "image/jpeg",
              },
            ]
          : DEMO_DOSYALAR
      dosyalar.forEach((d, j) =>
        gelen.push({
          ...d,
          id: `g_fis_${i + 1}_${j + 1}`,
          talepId: id,
          mukellefId: m.id,
          boyut: 420_000 + j * 37_000,
          yuklemeTarihi: `2026-09-0${3 + i}T10:00:00.000Z`,
          durum: "ONAYLANDI",
          inceleyenId: personelId,
          incelemeTarihi: inceleme,
        })
      )
    })
  return { talep, gelen }
}

export function createFisAktarimiVerisi(
  mukellefler: Mukellef[],
  mevcutTalepler: EvrakTalebi[],
  mevcutGelenler: GelenEvrak[],
  ebelgeler: EBelge[],
  personelId: string
): {
  talep: EvrakTalebi[]
  gelen: GelenEvrak[]
  okuma: BelgeOkuma[]
  fis: MuhasebeFisi[]
} {
  const demo = demoTalepleri(mukellefler, personelId)
  const talepler = [...mevcutTalepler, ...demo.talep]
  const gelenler = [...mevcutGelenler, ...demo.gelen]
  const okuma: BelgeOkuma[] = []
  const fis: MuhasebeFisi[] = []
  const fisOkumalari = new Map<string, FisOkumasi[]>()

  const gelen = gelenler.map((g) => {
    const tur = okumaTuru(g.istenen)
    const m = mukellefler.find((x) => x.id === g.mukellefId)
    if (g.durum !== "ONAYLANDI" || !tur || !m || !fisAktarimiDestekli(m))
      return g
    const simdi = g.incelemeTarihi ?? g.yuklemeTarihi
    const talep = talepler.find((t) => t.id === g.talepId)
    const onceki = fisOkumalari.get(m.id) ?? []
    const sonuc = okumaSonuclandir(okumaBaslat(g, tur, simdi), {
      gelen: g,
      donem: belgeDonemi(g, talep),
      ayar: varsayilanHesapAyari(m.id),
      digerFisOkumalari: onceki,
      ebelgeler: ebelgeler.filter((e) => e.mukellefId === m.id),
      simdi,
    })
    if (sonuc.okuma.fis) fisOkumalari.set(m.id, [...onceki, sonuc.okuma.fis])
    okuma.push(sonuc.okuma)
    // Hatasız fişlerin bir kısmı önceden onaylanmış olsun ("Aktarıma hazır" sekmesi boş kalmasın)
    for (const f of sonuc.fisler) {
      const hazir = fisHatalari(f).length === 0 && fis.length % 2 === 0
      fis.push(
        hazir
          ? {
              ...f,
              durum: "ONAYLANDI",
              onaylayanId: g.inceleyenId,
              onayTarihi: simdi,
            }
          : f
      )
    }
    return { ...g, okumaId: sonuc.okuma.id }
  })

  return { talep: talepler, gelen, okuma, fis }
}
