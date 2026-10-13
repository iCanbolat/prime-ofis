import { describe, expect, it, vi } from "vitest"

import type { EpostaKanalAyari, WhatsappKanalAyari } from "@prime/shared/types/domain"

import { GercekKanalSaglayici, GRAPH_API } from "../src/kanal/gercek-saglayici.js"

const WHATSAPP: WhatsappKanalAyari = {
  id: "WHATSAPP",
  tip: "WHATSAPP",
  aktif: true,
  durum: "BAGLI",
  telefonNumarasiId: "109876543210",
  wabaId: "208765432109",
  gorunenNumara: "+90 216 345 67 89",
  sablonlar: { BORC_HATIRLATMA: "borc_hatirlatma_v1" },
}

const yanit = (status: number, govde: unknown) =>
  new Response(JSON.stringify(govde), { status, headers: { "content-type": "application/json" } })

describe("gerçek kanal sağlayıcısı", () => {
  it("WhatsApp: onaylı şablonla Graph API'ye gönderir, wamid döner", async () => {
    const istek = vi.fn(async () => yanit(200, { messages: [{ id: "wamid.ABC" }] }))
    const s = new GercekKanalSaglayici(istek as unknown as typeof fetch)
    const sonuc = await s.gonder(
      WHATSAPP,
      {
        adres: "0533 111 22 67",
        konu: "",
        metin: "",
        whatsappSablon: "BORC_HATIRLATMA",
        parametreler: ["Çınar Ltd.", ""],
      },
      "EAAG-anahtar"
    )
    expect(sonuc).toEqual({ basarili: true, saglayiciId: "wamid.ABC" })
    const [url, secenek] = istek.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${GRAPH_API}/109876543210/messages`)
    expect((secenek.headers as Record<string, string>).authorization).toBe("Bearer EAAG-anahtar")
    expect(JSON.parse(secenek.body as string)).toMatchObject({
      to: "905331112267",
      type: "template",
      template: {
        name: "borc_hatirlatma_v1",
        language: { code: "tr" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "Çınar Ltd." }, { type: "text", text: "—" }] },
        ],
      },
    })
  })

  it("WhatsApp: eşlenmemiş şablon kalıcı, 429 / ağ hatası geçici", async () => {
    const s = new GercekKanalSaglayici(vi.fn() as unknown as typeof fetch)
    expect(
      await s.gonder(WHATSAPP, { adres: "05331112267", konu: "", metin: "", whatsappSablon: "TALEP" }, "x")
    ).toMatchObject({ basarili: false, hataMesaji: expect.stringMatching(/eşlenmemiş/) })

    const sinir = new GercekKanalSaglayici(
      (async () => yanit(429, { error: { message: "Rate limit", code: 130429 } })) as typeof fetch
    )
    const mesaj = { adres: "05331112267", konu: "", metin: "", whatsappSablon: "BORC_HATIRLATMA" as const }
    expect(await sinir.gonder(WHATSAPP, mesaj, "x")).toEqual({
      basarili: false,
      hataMesaji: "Rate limit (130429)",
      gecici: true,
    })
    const ag = new GercekKanalSaglayici((async () => {
      throw new Error("ECONNRESET")
    }) as typeof fetch)
    expect(await ag.gonder(WHATSAPP, mesaj, "x")).toMatchObject({ basarili: false, gecici: true })
    const yetki = new GercekKanalSaglayici(
      (async () => yanit(401, { error: { message: "Invalid OAuth access token", code: 190 } })) as typeof fetch
    )
    expect(await yetki.dogrula(WHATSAPP, "x")).toEqual({
      gecerli: false,
      hataMesaji: "Invalid OAuth access token (190)",
    })
  })

  it("SMTP: sunucuya bağlanılamazsa doğrulama hatası; Telegram desteklenmiyor", async () => {
    const s = new GercekKanalSaglayici()
    const eposta: EpostaKanalAyari = {
      id: "EPOSTA",
      tip: "EPOSTA",
      aktif: true,
      durum: "BAGLI",
      sunucu: "127.0.0.1",
      port: 1,
      guvenlik: "STARTTLS",
      kullanici: "u",
      gonderenAd: "Büro",
      gonderenAdres: "buro@ornek.com",
    }
    expect(await s.dogrula(eposta, "sifre")).toEqual({
      gecerli: false,
      hataMesaji: "SMTP sunucusuna bağlanılamadı",
    })
    expect(
      await s.gonder(
        { id: "TELEGRAM", tip: "TELEGRAM", aktif: true, durum: "BAGLI", botKullaniciAdi: "PrimeBot" },
        { adres: "1", konu: "", metin: "" },
        "t"
      )
    ).toMatchObject({ basarili: false, hataMesaji: "Telegram kanalı henüz desteklenmiyor" })
  })
})
