import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { ApiError, http } from "@/lib/http"
import type { GibTebligatAdapter } from "@prime/shared/tebligat/gib-adapter"
import { STORAGE_KEY, db } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import {
  geceTaramasiCalistir,
  sonGeceTaramaAni,
} from "@/mocks/handlers/tebligat"
import type {
  TebligatErisimSatiri,
  TebligatListResponse,
  TebligatMukellefTaraResponse,
  TebligatOzetResponse,
  TebligatView,
} from "@prime/shared/types/api"
import type { Gorev } from "@prime/shared/types/domain"

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
const liste = (params: Record<string, unknown> = {}) =>
  http.get<TebligatListResponse>("/tebligat", { params: params as never })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
  oturum(mehmet)
})
afterEach(() => vi.useRealTimers())

/** Her çağrıda kutuya verilen belgeleri döndüren sahte GİB adaptörü */
function sahteAdapter(
  belgeler: Record<string, { belgeId: string; belgeTuru: string }[]>
): GibTebligatAdapter {
  return {
    async girisDogrula(k) {
      return k.sifre === "hatali"
        ? { gecerli: false, hataMesaji: "Şifre hatalı" }
        : { gecerli: true }
    },
    async yeniBelgeler(k) {
      if (k.sifre === "hatali")
        return { gecerli: false, hataMesaji: "Şifre hatalı" }
      return {
        gecerli: true,
        belgeler: (belgeler[k.kullaniciKodu] ?? []).map((b) => ({
          ...b,
          kurum: "GIB" as const,
          konu: b.belgeTuru,
          ulasmaTarihi: new Date(2026, 8, 22, 15, 0).toISOString(),
        })),
      }
    },
  }
}

describe("GET /api/tebligat", () => {
  it("açıklar son güne göre önce; kapsam filtreleri", async () => {
    expect((await liste()).items.map((t) => t.id)).toEqual([
      "tb_acil",
      "tb_kapali",
    ])
    const acil = (await liste({ kapsam: "acil" })).items
    expect(acil.map((t) => [t.id, t.kalanGun, t.sonIslemTarihi])).toEqual([
      ["tb_acil", 2, "2026-09-25"],
    ])
    expect((await liste({ kapsam: "kapali" })).total).toBe(1)
    expect((await liste({ mukellefId: "m_ltd" })).total).toBe(1)
  })

  it("özet: açık, acil, son gece taraması ve erişim sayıları", async () => {
    const o = await http.get<TebligatOzetResponse>("/tebligat/ozet")
    expect(o).toMatchObject({ acik: 1, acil: 1, geciken: 0 })
    expect(o.sonTarama).toMatchObject({ taranan: 2, hatali: 1 })
    expect(o.erisim).toEqual({ aktif: 1, hatali: 1, tanimsiz: 1 })
  })
})

describe("gece taraması", () => {
  it("son gece anı: 03:00'ten önce bir önceki gece", () => {
    expect(sonGeceTaramaAni(new Date(2026, 8, 23, 10, 0))).toEqual(
      new Date(2026, 8, 23, 3, 0)
    )
    expect(sonGeceTaramaAni(new Date(2026, 8, 23, 2, 59))).toEqual(
      new Date(2026, 8, 22, 3, 0)
    )
  })

  it("erişimi aktif mükellefin yeni belgeleri kaydedilir; aynı belge iki kez kaydedilmez; hatalı atlanır", async () => {
    const adapter = sahteAdapter({
      "0174520662": [
        { belgeId: "gib-yeni-1", belgeTuru: "Vergi/Ceza İhbarnamesi" },
        { belgeId: "gib-f-1", belgeTuru: "Ödeme Emri" },
      ],
    })
    const an = new Date(2026, 8, 24, 3, 0)
    const tarama = await geceTaramasiCalistir(an, adapter)
    expect(tarama).toMatchObject({ taranan: 2, hatali: 1, yeni: 1 })

    const yeni = db.tebligat.where((t) => t.gibBelgeId === "gib-yeni-1")
    expect(yeni).toHaveLength(1)
    expect(yeni[0]).toMatchObject({
      mukellefId: "m_ltd",
      vkn: "0174520662",
      tur: "VERGI_CEZA_IHBARNAMESI",
      durum: "YENI",
      kaynak: "GIB",
    })
    expect(db.tebligatErisim.find("te_ltd")?.sonTarama).toBe(an.toISOString())
    // Hatalı erişim gece denenmez, son başarılı tarama ilerlemez
    expect(db.tebligatErisim.find("te_as")).toMatchObject({
      durum: "HATA",
      sonTarama: new Date(2026, 8, 20, 3, 0).toISOString(),
    })

    // Ertesi gece aynı belge yeniden listelense de çift kayıt olmaz
    await geceTaramasiCalistir(new Date(2026, 8, 25, 3, 0), adapter)
    expect(
      db.tebligat.where((t) => t.gibBelgeId === "gib-yeni-1")
    ).toHaveLength(1)
    // Sorumlu ve yöneticiye "Yeni e-Tebligat" bildirimi
    expect(
      db.bildirim.where(
        (b) => b.tur === "TEBLIGAT_ALINDI" && b.aliciId === "p_1"
      )
    ).toHaveLength(1)
  })

  it("giriş ilk kez başarısız olunca erişim HATA'ya düşer, sorumluya bir kez bildirim gider", async () => {
    const adapter: GibTebligatAdapter = {
      girisDogrula: async () => ({ gecerli: true }),
      yeniBelgeler: async () => ({
        gecerli: false,
        hataMesaji: "GİB şifresinin süresi dolmuş",
      }),
    }
    await geceTaramasiCalistir(new Date(2026, 8, 24, 3, 0), adapter)
    await geceTaramasiCalistir(new Date(2026, 8, 25, 3, 0), adapter)
    expect(db.tebligatErisim.find("te_ltd")).toMatchObject({
      durum: "HATA",
      hataMesaji: "GİB şifresinin süresi dolmuş",
    })
    expect(
      db.bildirim.where(
        (b) => b.tur === "TEBLIGAT_ERISIM_HATASI" && b.aliciId === "p_3"
      )
    ).toHaveLength(1)
  })
})

describe("GİB erişimi", () => {
  it("liste: hatalı ve tanımsız önce; şifre saklanmaz, yalnızca son 4 karakter; hatalı şifre 422", async () => {
    const satirlar = await http.get<TebligatErisimSatiri[]>("/tebligat/erisim")
    expect(satirlar.map((s) => [s.mukellefId, s.durum])).toEqual([
      ["m_sahis", "TANIMSIZ"],
      ["m_as", "HATA"],
      ["m_ltd", "AKTIF"],
    ])
    expect(
      await http.get<TebligatErisimSatiri[]>("/tebligat/erisim", {
        params: { durum: "HATA" },
      })
    ).toHaveLength(1)

    const sifre = "ivd-sifresi-7k2p"
    expect(
      await hataDurumu(
        http.put("/tebligat/erisim/m_sahis", {
          kullaniciKodu: "10000000146",
          sifre: "hatali-sifre",
        })
      )
    ).toBe(422)
    expect(
      await hataDurumu(
        http.put("/tebligat/erisim/m_sahis", { kullaniciKodu: "12", sifre })
      )
    ).toBe(400)
    const s = await http.put<TebligatErisimSatiri>("/tebligat/erisim/m_sahis", {
      kullaniciKodu: "10000000146",
      sifre,
    })
    expect(s).toMatchObject({
      durum: "AKTIF",
      erisim: { kullaniciKodu: "10000000146", sifreIpucu: "7k2p" },
    })
    expect(JSON.stringify(s)).not.toContain(sifre)
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain(sifre)

    await http.delete("/tebligat/erisim/m_sahis")
    expect(
      (await http.get<TebligatErisimSatiri>("/tebligat/erisim/m_sahis")).durum
    ).toBe("TANIMSIZ")
  })

  it("şifre güncellenince hatalı erişim düzelir; tek mükellef hemen taranabilir", async () => {
    expect(await hataDurumu(http.post("/tebligat/erisim/m_as/tara"))).toBe(409)
    await http.put("/tebligat/erisim/m_as", {
      kullaniciKodu: "9358005601",
      sifre: "yeni-sifre",
    })
    const r = await http.post<TebligatMukellefTaraResponse>(
      "/tebligat/erisim/m_as/tara"
    )
    expect(r.erisim).toMatchObject({ durum: "AKTIF" })
    expect(r.erisim.sonTarama).toBe(new Date(2026, 8, 23, 10, 0).toISOString())
    expect(await hataDurumu(http.post("/tebligat/erisim/m_sahis/tara"))).toBe(
      404
    )
  })
})

describe("kasadan aktarım", () => {
  const ivdKaydi = (mukellefId: string, sistem: "IVD" | "GIB" = "IVD") =>
    db.credential.insert({
      mukellefId,
      sistem,
      kullaniciAdi: "10000000146",
      cipherText: "eA==",
      iv: "eA==",
      sonGuncelleme: new Date(2026, 8, 1).toISOString(),
      guncelleyenId: "p_1",
    })

  it("kaynak kasa kaydı saklanır, erişim geçmişine yazılır; kasa sonradan değişince 'daha yeni' döner", async () => {
    const k = ivdKaydi("m_sahis")
    const s = await http.put<TebligatErisimSatiri>("/tebligat/erisim/m_sahis", {
      kullaniciKodu: "10000000146",
      sifre: "kasadaki-sifre",
      kasaCredentialId: k.id,
    })
    expect(s).toMatchObject({
      kasaKaydiId: k.id,
      kasaDahaYeni: false,
      erisim: {
        kasaKaynagi: {
          credentialId: k.id,
          credentialGuncelleme: k.sonGuncelleme,
        },
      },
    })
    expect(
      db.aktivite.where(
        (a) => a.eylem === "SIFRE_TEBLIGATA_AKTARILDI" && a.hedefId === k.id
      )
    ).toHaveLength(1)

    db.credential.update(k.id, {
      sonGuncelleme: new Date(2026, 8, 20).toISOString(),
    })
    expect(
      (await http.get<TebligatErisimSatiri>("/tebligat/erisim/m_sahis"))
        .kasaDahaYeni
    ).toBe(true)

    // Elle girilen şifre kasa bağını koparır
    const elle = await http.put<TebligatErisimSatiri>(
      "/tebligat/erisim/m_sahis",
      { kullaniciKodu: "10000000146", sifre: "elle-girilen" }
    )
    expect(elle.erisim?.kasaKaynagi).toBeUndefined()
    expect(elle.kasaDahaYeni).toBe(false)
  })

  it("başka mükellefin ya da İnteraktif VD olmayan kayıt reddedilir", async () => {
    const baska = ivdKaydi("m_as")
    const gib = ivdKaydi("m_sahis", "GIB")
    for (const id of [baska.id, gib.id])
      expect(
        await hataDurumu(
          http.put("/tebligat/erisim/m_sahis", {
            kullaniciKodu: "10000000146",
            sifre: "kasadaki-sifre",
            kasaCredentialId: id,
          })
        )
      ).toBe(400)
  })
})

describe("güncelleme, görev ve belge", () => {
  it("sorumlu atanınca bildirim gider", async () => {
    oturum(yonetici)
    const t = await http.patch<TebligatView>("/tebligat/tb_acil", {
      atananId: "p_2",
      durum: "INCELENDI",
    })
    expect(t).toMatchObject({
      mukellefUnvan: "Çınar Yazılım San. ve Tic. Ltd. Şti.",
      atananAd: "Mehmet Kaya",
    })
    expect(
      db.bildirim.where(
        (b) => b.aliciId === "p_2" && b.baslik === "Bir e-Tebligat size atandı"
      )
    ).toHaveLength(1)
  })

  it("görev son işlem gününe açılır, ikinci kez açılamaz", async () => {
    const g = await http.post<Gorev>("/tebligat/tb_acil/gorev")
    expect(g).toMatchObject({
      mukellefId: "m_ltd",
      sonTarih: "2026-09-25",
      oncelik: "YUKSEK",
      atananId: "p_3",
    })
    expect(db.tebligat.find("tb_acil")).toMatchObject({
      gorevId: g.id,
      durum: "INCELENDI",
    })
    expect(await hataDurumu(http.post("/tebligat/tb_acil/gorev"))).toBe(409)
  })

  it("özel süre son günü değiştirir; belge arşive TEBLIGAT kategorisinde", async () => {
    const t = await http.patch<TebligatView>("/tebligat/tb_acil", {
      sureGun: 30,
    })
    expect(t.sonIslemTarihi).toBe("2026-10-12")
    const b = await http.post<TebligatView>("/tebligat/tb_acil/belge", {
      dosya: {
        ad: "odeme-emri.pdf",
        dataUrl: "data:application/pdf;base64,JVBERg==",
      },
    })
    expect(db.arsiv.find(b.arsivDosyaId!)).toMatchObject({
      mukellefId: "m_ltd",
      kategori: "TEBLIGAT",
    })
  })

  it("elle kayıt; gelecek tarih reddedilir", async () => {
    const t = await http.post<TebligatView>("/tebligat", {
      mukellefId: "m_sahis",
      kurum: "GIB",
      tur: "IZAHA_DAVET",
      konu: "İzaha davet",
      ulasmaGunu: "2026-09-22",
    })
    expect(t).toMatchObject({
      kaynak: "ELLE",
      vkn: "10000000146",
      atananId: "p_2",
    })
    expect(
      await hataDurumu(
        http.post("/tebligat", {
          mukellefId: "m_sahis",
          kurum: "GIB",
          tur: "DIGER",
          konu: "x",
          ulasmaGunu: "2026-09-30",
        })
      )
    ).toBe(400)
  })
})

describe("hatırlatma", () => {
  it("son günü yaklaşan açık tebligat için sorumluya bildirim", async () => {
    oturum(PERSONEL[2]!)
    await http.get("/bildirim")
    expect(
      db.bildirim.where(
        (b) => b.tur === "TEBLIGAT_SURE_YAKLASIYOR" && b.aliciId === "p_3"
      )
    ).toHaveLength(1)
  })
})
