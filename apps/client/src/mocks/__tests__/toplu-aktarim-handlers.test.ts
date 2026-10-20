import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { decryptJson, encryptJson } from "@/lib/crypto"
import { ApiError, http } from "@/lib/http"
import { db } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import { demoKasaAnahtari } from "@/test/kasa"
import type {
  AcilisTopluRequest,
  CredentialTopluRequest,
  TopluAktarimSonucu,
} from "@prime/shared/types/api"

const [yonetici, mehmet] = PERSONEL as [
  (typeof PERSONEL)[0],
  (typeof PERSONEL)[0],
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
  useAuthStore.setState({ user: mehmet })
})
afterEach(() => vi.useRealTimers())

describe("POST /api/kasa/credentials/toplu", () => {
  it("şifreli kayıtları ekler; mevcut kayıt yalnızca üzerine yaz ile güncellenir", async () => {
    const key = await demoKasaAnahtari()
    const kayit = async (sifre: string) => ({
      satir: 2,
      mukellefId: "m_ltd",
      sistem: "GIB" as const,
      kullaniciAdi: "yeni",
      ...(await encryptJson({ sifre }, key)),
    })
    const gonder = async (uzerineYaz: boolean, sifre: string) =>
      http.post<TopluAktarimSonucu>("/kasa/credentials/toplu", {
        uzerineYaz,
        kayitlar: [await kayit(sifre)],
      } satisfies CredentialTopluRequest)

    expect(await gonder(false, "a")).toMatchObject({
      olusturulan: 0,
      atlanan: 1,
    })
    expect(await gonder(true, "b")).toMatchObject({ guncellenen: 1 })
    const c = db.credential.where(
      (c) => c.mukellefId === "m_ltd" && c.sistem === "GIB"
    )[0]!
    expect(c.kullaniciAdi).toBe("yeni")
    expect(await decryptJson(c, key)).toEqual({ sifre: "b" })
  })

  it("şifrelenmemiş kayıt reddedilir", async () => {
    const sonuc = await http.post<TopluAktarimSonucu>(
      "/kasa/credentials/toplu",
      {
        uzerineYaz: false,
        kayitlar: [
          {
            satir: 5,
            mukellefId: "m_as",
            sistem: "IVD",
            kullaniciAdi: "x",
            cipherText: "düz şifre",
            iv: "",
          },
        ],
      }
    )
    expect(sonuc.hatalar).toEqual([
      { satir: 5, mesaj: "Şifre şifrelenmiş olarak gönderilmelidir" },
    ])
  })
})

describe("POST /api/tahsilat/acilis-toplu", () => {
  const govde = (ek: Partial<AcilisTopluRequest> = {}): AcilisTopluRequest => ({
    uzerineYaz: false,
    kayitlar: [
      {
        satir: 2,
        mukellefId: "m_as",
        ucret: {
          aylikBrut: 5000,
          kdvOrani: 20,
          stopajVar: true,
          baslangicDonem: "2026-10",
        },
        bakiye: { tutar: 12_500, tarih: "2026-09-23" },
      },
    ],
    ...ek,
  })

  it("yalnızca yönetici aktarabilir", async () => {
    await expect(
      http.post("/tahsilat/acilis-toplu", govde())
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<ApiError>)
  })

  it("ücreti tanımlar, açılış borcunu bir kez yazar; başlangıçtan önceki aylar borçlandırılmaz", async () => {
    useAuthStore.setState({ user: yonetici })
    expect(
      await http.post<TopluAktarimSonucu>("/tahsilat/acilis-toplu", govde())
    ).toMatchObject({ olusturulan: 1 })
    expect(db.mukellef.find("m_as")!.ucret?.aylikBrut).toBe(5000)
    const hareketler = () => db.cari.where((h) => h.mukellefId === "m_as")
    expect(hareketler().filter((h) => h.kalem === "ACILIS")).toMatchObject([
      { tip: "BORC", tutar: 12_500, brut: 12_500, kdv: 0 },
    ])
    expect(hareketler().filter((h) => h.kalem === "AYLIK_UCRET")).toHaveLength(
      0
    )

    // Tekrar aktarım: bakiye yeniden yazılmaz, ücret korunur
    expect(
      await http.post<TopluAktarimSonucu>("/tahsilat/acilis-toplu", govde())
    ).toMatchObject({ olusturulan: 0, atlanan: 1 })
    expect(hareketler().filter((h) => h.kalem === "ACILIS")).toHaveLength(1)
  })

  it("eksi bakiye avans olarak açık borçlara dağıtılır", async () => {
    useAuthStore.setState({ user: yonetici })
    await http.post("/tahsilat/acilis-toplu", {
      uzerineYaz: false,
      kayitlar: [
        {
          satir: 2,
          mukellefId: "m_ltd",
          bakiye: { tutar: -1000, tarih: "2026-09-23" },
        },
      ],
    } satisfies AcilisTopluRequest)
    const avans = db.cari.where(
      (h) => h.mukellefId === "m_ltd" && h.kalem === "ACILIS"
    )[0]!
    expect(avans).toMatchObject({ tip: "ODEME", tutar: 1000 })
    expect(avans.kapatmalar?.reduce((t, k) => t + k.tutar, 0)).toBe(1000)
  })
})
