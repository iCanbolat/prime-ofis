import { HttpException } from "@nestjs/common"
import { eq } from "drizzle-orm"
import type { FastifyRequest } from "fastify"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { PERSONEL } from "@prime/mock-data/factories/personel"

import { aktivite, bildirim } from "../src/db/schema/index.js"
import { DosyaErisimKaydi } from "../src/dosya/dosya-erisim-kaydi.js"
import { arsivAnahtari, DosyaService } from "../src/dosya/dosya.service.js"
import { testUygulamasi, type TestUygulamasi } from "./harness.js"

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n")
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
)
const dataUrl = (mime: string, b: Buffer) => `data:${mime};base64,${b.toString("base64")}`

async function hata(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    if (e instanceof HttpException) return { status: e.getStatus(), ...(e.getResponse() as object) }
    throw e
  }
  throw new Error("hata bekleniyordu")
}

describe("DosyaService", () => {
  let t: TestUygulamasi
  let dosyalar: DosyaService
  beforeAll(async () => {
    t = await testUygulamasi()
    dosyalar = t.app.get(DosyaService)
  })
  afterAll(() => t.kapat())
  beforeEach(() => t.fixtureYukle())

  it("türü magic byte'tan tespit eder; istemcinin bildirdiğine güvenmez", async () => {
    const pdf = await dosyalar.dataUrlCoz(dataUrl("application/pdf", PDF))
    expect(pdf).toMatchObject({ mimeType: "application/pdf", boyut: PDF.length })
    const png = await dosyalar.dataUrlCoz(dataUrl("application/pdf", PNG))
    expect(png.mimeType).toBe("image/png")
  })

  it("desteklenmeyen tür, bozuk dataUrl, boş ve 10 MB üstü reddedilir", async () => {
    expect(await hata(dosyalar.dataUrlCoz(dataUrl("application/pdf", Buffer.from("merhaba"))))).toEqual({
      status: 400,
      message: "Desteklenmeyen dosya türü. PDF, JPG, PNG veya HEIC yükleyin.",
    })
    expect(await hata(dosyalar.dataUrlCoz("merhaba"))).toMatchObject({
      message: "Dosya içeriği okunamadı",
    })
    expect(await hata(dosyalar.dataUrlCoz("data:application/pdf;base64,%%%"))).toMatchObject({
      message: "Dosya içeriği okunamadı",
    })
    expect(await hata(dosyalar.dataUrlCoz("data:application/pdf;base64,"))).toMatchObject({
      message: "Dosya boş",
    })
    const buyuk = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)])
    expect(await hata(dosyalar.dataUrlCoz(dataUrl("application/pdf", buyuk)))).toMatchObject({
      message: "Dosya 10 MB sınırını aşıyor.",
    })
  })

  it("depoya yazar, okur, siler; dataUrl'e geri çevirir", async () => {
    const d = await dosyalar.dataUrlCoz(dataUrl("application/pdf", PDF))
    const anahtar = arsivAnahtari("m_ltd", "d_1")
    await dosyalar.koy(anahtar, d)
    expect(t.depo.nesneler.get("arsiv/m_ltd/d_1")?.mimeType).toBe("application/pdf")
    const geri = await dosyalar.getir(anahtar)
    expect(dosyalar.dataUrlYap(geri!, d.mimeType)).toBe(dataUrl("application/pdf", PDF))
    await dosyalar.sil(anahtar)
    expect(await dosyalar.getir(anahtar)).toBeNull()
  })

  it("erişim kaydı: indir / önizle aktivitesi, bildirim üretmez", async () => {
    const kayit = t.app.get(DosyaErisimKaydi)
    const dosya = { hedefTip: "ARSIV" as const, hedefId: "d_1", mukellefId: "m_ltd", ad: "levha.pdf" }
    await kayit.kaydet({ query: { islem: "indir" } } as unknown as FastifyRequest, PERSONEL[1]!, dosya)
    await kayit.kaydet({ query: {} } as unknown as FastifyRequest, PERSONEL[1]!, dosya)
    const kayitlar = await t.db.select().from(aktivite).where(eq(aktivite.hedefId, "d_1"))
    expect(kayitlar.map((a) => a.eylem).sort()).toEqual(["DOSYA_GORUNTULENDI", "DOSYA_INDIRILDI"])
    expect(await t.db.select().from(bildirim)).toEqual([])
  })
})
