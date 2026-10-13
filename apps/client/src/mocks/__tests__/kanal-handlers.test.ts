import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { ApiError, http } from "@/lib/http"
import { STORAGE_KEY, db } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import { logActivity } from "@/mocks/handlers/common"
import type {
  BildirimTercihView,
  GonderimListResponse,
  KanalTestResponse,
  KanallarResponse,
  MukellefGonderResponse,
  TelegramBaglamaResponse,
  TalepView,
} from "@prime/shared/types/api"
import type { KanalAyari } from "@prime/shared/types/domain"

const [yonetici, mehmet] = PERSONEL as [
  (typeof PERSONEL)[0],
  (typeof PERSONEL)[0],
]
const oturum = (p: (typeof PERSONEL)[0]) => useAuthStore.setState({ user: p })
const hataDurumu = (p: Promise<unknown>) =>
  p.then(
    () => 0,
    (e: ApiError) => e.status
  )
const gonder = (body: Record<string, unknown>) =>
  http.post<MukellefGonderResponse>("/gonderim/mukellef", body)

const WHATSAPP = {
  tip: "WHATSAPP",
  aktif: true,
  telefonNumarasiId: "109876543210",
  wabaId: "208765432109",
  gorunenNumara: "+90 216 345 67 89",
  erisimAnahtari: "EAAG-kalici-anahtar-9Zq1",
  sablonlar: { BORC_HATIRLATMA: "borc_hatirlatma_v1", TALEP: "evrak_talebi" },
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
  oturum(mehmet)
})
afterEach(() => vi.useRealTimers())

describe("kanal yapılandırması", () => {
  it("yalnızca yönetici; gizli anahtar saklanmaz, son 4 hane döner; hatalı anahtar 422", async () => {
    expect(await hataDurumu(http.put("/kanallar/WHATSAPP", WHATSAPP))).toBe(403)
    oturum(yonetici)
    expect(
      await hataDurumu(
        http.put("/kanallar/WHATSAPP", {
          ...WHATSAPP,
          erisimAnahtari: "hatali-anahtar",
        })
      )
    ).toBe(422)
    const k = await http.put<KanalAyari>("/kanallar/WHATSAPP", WHATSAPP)
    expect(k).toMatchObject({ durum: "BAGLI", gizliIpucu: "9Zq1" })
    expect(JSON.stringify(await http.get("/kanallar"))).not.toContain(
      WHATSAPP.erisimAnahtari
    )
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain(
      WHATSAPP.erisimAnahtari
    )

    // Güncellemede anahtar boş bırakılırsa mevcut korunur; ilk kurulumda zorunlu
    const g = await http.put<KanalAyari>("/kanallar/WHATSAPP", {
      ...WHATSAPP,
      erisimAnahtari: undefined,
      gorunenNumara: "+90 216 000 00 00",
    })
    expect(g).toMatchObject({
      gizliIpucu: "9Zq1",
      gorunenNumara: "+90 216 000 00 00",
    })
    expect(
      await hataDurumu(
        http.put("/kanallar/TELEGRAM", {
          tip: "TELEGRAM",
          aktif: true,
          botKullaniciAdi: "PrimeBot",
        })
      )
    ).toBe(400)
  })

  it("test mesajı kullanıcının kendi adresine; kaldırılan kanal null döner", async () => {
    oturum(yonetici)
    const t = await http.post<KanalTestResponse>("/kanallar/EPOSTA/test")
    expect(t.gonderim).toMatchObject({
      kanal: "EPOSTA",
      durum: "GONDERILDI",
      kaynak: "TEST",
      adres: "ay***@primemusavirlik.com.tr",
    })
    await http.delete("/kanallar/EPOSTA")
    expect((await http.get<KanallarResponse>("/kanallar")).EPOSTA).toBeNull()
  })
})

describe("personel bildirimlerinin dış kanallara dağıtımı", () => {
  const gorevAtandi = () =>
    logActivity({
      aktorId: yonetici.id,
      eylem: "GOREV_ATANDI",
      hedefTip: "GOREV",
      hedefId: "o_banka",
      mukellefId: "m_ltd",
    })

  it("varsayılan tercih: yalnızca hatırlatma ve tebligat e-postayla gider", async () => {
    gorevAtandi()
    expect(db.gonderim.count()).toBe(0)
    // Mehmet'e (p_2) atanmış geciken görev → "uyari" kategorisi
    oturum(mehmet)
    await http.get("/bildirim")
    const epostalar = db.gonderim.where(
      (g) => g.aliciId === "p_2" && g.kaynak === "BILDIRIM"
    )
    expect(epostalar.length).toBeGreaterThan(0)
    expect(
      epostalar.every((g) => g.kanal === "EPOSTA" && g.durum === "GONDERILDI")
    ).toBe(true)
  })

  it("tercih değişir; Telegram bağlanınca Telegram'a da gider", async () => {
    oturum(yonetici)
    await http.put("/kanallar/TELEGRAM", {
      tip: "TELEGRAM",
      aktif: true,
      botKullaniciAdi: "PrimeOfisBot",
      token: "123456:ABCdefGhIJKlmNoPQRsTUVwxyZ",
    })
    oturum(mehmet)
    const b = await http.post<TelegramBaglamaResponse>(
      "/bildirim-tercihleri/ben/telegram"
    )
    expect(b.link).toBe(`https://t.me/PrimeOfisBot?start=${b.kod}`)
    const t = await http.post<BildirimTercihView>(
      "/bildirim-tercihleri/ben/telegram/dogrula"
    )
    expect(t.telegramBagli).toBe(true)
    await http.put("/bildirim-tercihleri/ben", {
      kanallar: { gorev: ["TELEGRAM"], uyari: [] },
    })
    gorevAtandi()
    const g = db.gonderim.where((x) => x.aliciId === "p_2")
    expect(g.map((x) => x.kanal)).toEqual(["TELEGRAM"])
    expect(
      await hataDurumu(
        http.put("/bildirim-tercihleri/ben", { kanallar: { gorev: ["SMS"] } })
      )
    ).toBe(400)
  })
})

describe("mükellefe gönderim", () => {
  it("WhatsApp yapılandırılmamışsa wa.me bağlantısı (ELLE); borç mesajı bakiye ve dönemi içerir", async () => {
    const { sonuclar } = await gonder({
      sablon: "BORC_HATIRLATMA",
      hedefler: [{ mukellefId: "m_ltd" }],
    })
    expect(sonuclar[0]).toMatchObject({
      kanal: "WHATSAPP",
      durum: "ELLE",
      sunucudan: false,
    })
    expect(sonuclar[0]!.link).toMatch(/^https:\/\/wa\.me\/90533/)
    expect(sonuclar[0]!.mesaj).toContain("₺20.000,00")
    expect(sonuclar[0]!.mesaj).toContain("Ağustos 2026")
    expect(db.gonderim.where((g) => g.durum === "ELLE")).toHaveLength(1)
    expect(
      db.aktivite.where((a) => a.eylem === "MUKELLEFE_GONDERILDI")
    ).toHaveLength(1)
  })

  it("WhatsApp Business bağlıysa şablonla sunucudan; şablonu eşlenmemiş türde hata", async () => {
    oturum(yonetici)
    await http.put("/kanallar/WHATSAPP", WHATSAPP)
    const borc = await gonder({
      sablon: "BORC_HATIRLATMA",
      hedefler: [{ mukellefId: "m_ltd" }],
    })
    expect(borc.sonuclar[0]).toMatchObject({
      durum: "GONDERILDI",
      sunucudan: true,
    })
    expect(db.gonderim.all().at(-1)).toMatchObject({
      sablon: "BORC_HATIRLATMA",
      adres: "+90 533 *** ** 67",
    })
    db.tahakkuk.insert({
      id: "h_1",
      mukellefId: "m_ltd",
      tip: "KDV",
      donem: "2026-08",
      odenecek: 6749.5,
      vade: "2026-09-28",
      yukleyenId: "p_1",
      yuklemeTarihi: "2026-09-20T10:00:00.000Z",
    })
    const tk = await gonder({
      sablon: "TAHAKKUK",
      hedefler: [{ mukellefId: "m_ltd", tahakkukId: "h_1" }],
    })
    expect(tk.sonuclar[0]).toMatchObject({ durum: "HATA" })
    expect(tk.sonuclar[0]!.hataMesaji).toMatch(/şablonu eşlenmemiş/)
  })

  it("e-posta kanalı: düzenlenmiş metin gider; borcu olmayana gönderilmez; önizleme yazmaz", async () => {
    const on = await gonder({
      sablon: "BORC_HATIRLATMA",
      kanal: "EPOSTA",
      hedefler: [{ mukellefId: "m_ltd" }, { mukellefId: "m_sahis" }],
      onizleme: true,
    })
    expect(
      on.sonuclar.map((s) => [s.mukellefId, s.durum, s.hataMesaji])
    ).toEqual([
      ["m_ltd", undefined, undefined],
      ["m_sahis", undefined, "Açık borcu yok"],
    ])
    expect(db.gonderim.count()).toBe(0)

    const { sonuclar } = await gonder({
      sablon: "BORC_HATIRLATMA",
      kanal: "EPOSTA",
      hedefler: [{ mukellefId: "m_ltd" }],
      metin: "Özel metin",
    })
    expect(sonuclar[0]).toMatchObject({
      durum: "GONDERILDI",
      mesaj: "Özel metin",
    })
  })

  it("evrak talebi gönderimi talebin geçmişine yazılır; pasif talep reddedilir", async () => {
    const { sonuclar } = await gonder({
      sablon: "TALEP",
      kanal: "EPOSTA",
      hedefler: [{ mukellefId: "m_ltd", talepId: "e_aktif" }],
    })
    expect(sonuclar[0]!.durum).toBe("GONDERILDI")
    expect(sonuclar[0]!.mesaj).toContain("/p/")
    const t = await http.get<TalepView>("/evrak-talepleri/e_aktif")
    expect(t.gonderimler.at(-1)).toMatchObject({
      kanal: "EPOSTA",
      gonderenId: "p_2",
    })
    const sure = await gonder({
      sablon: "TALEP",
      hedefler: [{ mukellefId: "m_sahis", talepId: "e_sure" }],
    })
    expect(sure.sonuclar[0]).toMatchObject({
      durum: "HATA",
      hataMesaji: "Talep aktif değil",
    })
  })

  it("SMS kanalı yok", async () => {
    expect(
      await hataDurumu(
        gonder({
          sablon: "TALEP",
          kanal: "SMS",
          hedefler: [{ mukellefId: "m_ltd" }],
        })
      )
    ).toBe(400)
  })
})

describe("gönderim geçmişi", () => {
  it("yalnızca yönetici; hatalı gönderim yeniden denenir", async () => {
    expect(await hataDurumu(http.get("/gonderimler"))).toBe(403)
    oturum(yonetici)
    db.mukellef.update("m_ltd", { eposta: "gecersiz" })
    await gonder({
      sablon: "BORC_HATIRLATMA",
      kanal: "EPOSTA",
      hedefler: [{ mukellefId: "m_ltd" }],
    })
    const l = await http.get<GonderimListResponse>("/gonderimler", {
      params: { durum: "HATA" },
    })
    expect(l.items).toHaveLength(1)
    expect(l.hataliSon7Gun).toBe(1)
    db.mukellef.update("m_ltd", { eposta: "info@cinaryazilim.com.tr" })
    const y = await http.post<{ durum: string; denemeSayisi: number }>(
      `/gonderimler/${l.items[0]!.id}/tekrar`
    )
    expect(y).toMatchObject({ durum: "GONDERILDI", denemeSayisi: 2 })
  })
})
