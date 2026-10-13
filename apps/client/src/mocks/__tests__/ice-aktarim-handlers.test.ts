import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { ApiError, http } from "@/lib/http"
import { db } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import type {
  MizanDetay,
  MizanView,
  TahakkukIceAktarKalem,
  TahakkukIceAktarResponse,
  TahakkukView,
} from "@prime/shared/types/api"
import type { MizanHesap } from "@prime/shared/types/domain"

const mehmet = PERSONEL[1]!
const PDF = {
  ad: "tahakkuk.pdf",
  dataUrl: "data:application/pdf;base64,JVBERg==",
}
const XLSX = {
  ad: "mizan.xlsx",
  dataUrl:
    "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,UEs=",
}

const tahakkukGonder = (kalemler: Partial<TahakkukIceAktarKalem>[]) =>
  http.post<TahakkukIceAktarResponse>("/ice-aktarim/tahakkuklar", {
    kalemler: kalemler.map((k) => ({ dosya: PDF, ...k })),
  })

const h = (kod: string, borc: number, alacak: number): MizanHesap => ({
  kod,
  ad: "",
  borc,
  alacak,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
  useAuthStore.setState({ user: mehmet })
})
afterEach(() => vi.useRealTimers())

describe("tahakkuk içe aktarımı", () => {
  it("takvimi onaylar, arşive yazar, aynı dönemi günceller; hatalı kalemler ayrı raporlanır", async () => {
    const { sonuclar } = await tahakkukGonder([
      {
        mukellefId: "m_ltd",
        tip: "KDV",
        donem: "2026-08",
        beyannameKodu: "KDV1",
        odenecek: 6749.5,
        vade: "2026-09-28",
      },
      // Şahıs, işçisi yoksa MUHSGK yükümlüsü değil
      { mukellefId: "m_sahis", tip: "MUHTASAR_SGK", donem: "2026-08" },
      // Aylık KDV mükellefi için çeyrek dönem
      { mukellefId: "m_ltd", tip: "KDV", donem: "2026-Q3" },
      { mukellefId: "m_ltd", tip: "KDV", donem: "2026-10" },
    ])
    expect(sonuclar).toEqual([
      { sira: 0, durum: "EKLENDI" },
      {
        sira: 1,
        durum: "HATA",
        mesaj: "Ali Veli Muhtasar ve prim hizmet yükümlüsü değil",
      },
      {
        sira: 2,
        durum: "HATA",
        mesaj: "Mükellef aylık KDV veriyor; dönem uyuşmuyor",
      },
      { sira: 3, durum: "HATA", mesaj: "Gelecek dönemin tahakkuku olamaz" },
    ])

    expect(db.takvim.find("m_ltd:KDV:2026-08")?.durum).toBe("ONAYLANDI")
    const liste = await http.get<TahakkukView[]>("/ice-aktarim/tahakkuklar")
    expect(liste).toHaveLength(1)
    const dosya = db.arsiv.find(liste[0]!.arsivDosyaId!)
    expect(dosya).toMatchObject({ kategori: "TAHAKKUK", mukellefId: "m_ltd" })
    expect(db.aktivite.all().at(-1)).toMatchObject({
      eylem: "TAHAKKUK_ICE_AKTARILDI",
      hedefId: "m_ltd:KDV:2026-08",
    })

    const tekrar = await tahakkukGonder([
      { mukellefId: "m_ltd", tip: "KDV", donem: "2026-08", odenecek: 7000 },
    ])
    expect(tekrar.sonuclar[0]!.durum).toBe("GUNCELLENDI")
    expect(db.tahakkuk.all()).toHaveLength(1)
    expect(db.tahakkuk.all()[0]!.odenecek).toBe(7000)
  })

  it("boş istek reddedilir", async () => {
    await expect(tahakkukGonder([])).rejects.toBeInstanceOf(ApiError)
  })
})

describe("mizan içe aktarımı", () => {
  const denk = [
    h("100", 1000, 200),
    h("102", 10000, 0),
    h("360", 0, 6749.5),
    h("600", 0, 4050.5),
  ]

  it("kontrolleri çalıştırır, 360'ı dönem tahakkuklarıyla karşılaştırır, arşive yazar", async () => {
    await tahakkukGonder([
      { mukellefId: "m_ltd", tip: "KDV", donem: "2026-08", odenecek: 6749.5 },
    ])
    const z = await http.post<MizanView>("/ice-aktarim/mizanlar", {
      mukellefId: "m_ltd",
      donem: "2026-08",
      dosya: XLSX,
      hesaplar: denk,
    })
    expect(z.kontroller.map((k) => [k.kod, k.durum])).toEqual([
      ["DENKLIK", "GECTI"],
      ["KASA", "GECTI"],
      ["VERGI_360", "GECTI"],
    ])
    expect(z).toMatchObject({
      mukellefUnvan: "Çınar Yazılım San. ve Tic. Ltd. Şti.",
      hesapSayisi: 4,
      ozet: { toplamBorc: 11000, toplamAlacak: 11000, donemSonucu: 4050.5 },
    })
    expect(db.arsiv.find(z.arsivDosyaId!)?.kategori).toBe("MIZAN")

    const detay = await http.get<MizanDetay>(`/ice-aktarim/mizanlar/${z.id}`)
    expect(detay.hesaplar).toHaveLength(4)
    expect(
      await http.get<MizanView[]>("/ice-aktarim/mizanlar", {
        params: { mukellefId: "m_as" },
      })
    ).toEqual([])
  })

  it("çeyrek sonu hatasız mizan geçici vergi görevindeki maddeyi işaretler", async () => {
    const gorev = db.gorev.insert({
      ...db.gorev.find("o_kdv_ltd")!,
      id: "o_gecici",
      tip: "GECICI_VERGI",
      donem: "2026-Q2",
      otomatikAnahtar: "m_ltd:GECICI_VERGI:2026-Q2",
      checklist: [
        { id: "c1", metin: "Mizan kontrol edildi", tamam: false },
        { id: "c2", metin: "Geçici vergi hesaplandı", tamam: false },
      ],
    })
    const hatali = await http.post<MizanView>("/ice-aktarim/mizanlar", {
      mukellefId: "m_ltd",
      donem: "2026-06",
      dosya: XLSX,
      hesaplar: [h("100", 0, 500), h("600", 500, 0)],
    })
    expect(hatali.isaretlenenGorevId).toBeUndefined()
    expect(db.gorev.find(gorev.id)!.checklist[0]!.tamam).toBe(false)

    // Aynı dönem yeniden yüklenince kayıt güncellenir ve bu kez madde işaretlenir
    const duzgun = await http.post<MizanView>("/ice-aktarim/mizanlar", {
      mukellefId: "m_ltd",
      donem: "2026-06",
      dosya: XLSX,
      hesaplar: denk,
    })
    expect(duzgun.id).toBe(hatali.id)
    expect(duzgun.isaretlenenGorevId).toBe("o_gecici")
    expect(db.gorev.find(gorev.id)!.checklist[0]).toMatchObject({
      tamam: true,
      tamamlayanId: mehmet.id,
    })
    expect(db.mizan.all()).toHaveLength(1)
  })

  it("geçersiz dönem ve satırlar reddedilir", async () => {
    const gonder = (ek: Record<string, unknown>) =>
      http
        .post("/ice-aktarim/mizanlar", {
          mukellefId: "m_ltd",
          donem: "2026-08",
          dosya: XLSX,
          hesaplar: denk,
          ...ek,
        })
        .then(
          () => 0,
          (e: ApiError) => e.status
        )
    expect(await gonder({ donem: "2026-10" })).toBe(400)
    expect(await gonder({ hesaplar: [h("12", 1, 1)] })).toBe(400)
    expect(await gonder({ mukellefId: "yok" })).toBe(404)
  })
})
