import { describe, expect, it } from "vitest"

import {
  sonIslemTarihi,
  sureDurumu,
  tebligTarihi,
  tebligatTuru,
} from "@prime/shared/tebligat/kurallar"

/** Yerel saatle ulaşma anı (ISO) */
const ulasma = (ymd: string, saat = 10) =>
  new Date(`${ymd}T${String(saat).padStart(2, "0")}:00:00`).toISOString()

describe("e-Tebligat süreleri", () => {
  it("tebliğ, ulaşmayı izleyen 5. gün", () => {
    expect(tebligTarihi(ulasma("2026-09-05"))).toBe("2026-09-10")
    expect(tebligTarihi(ulasma("2026-12-29", 23))).toBe("2027-01-03")
  })

  it("son gün tebliğ + türün süresi; hafta sonu ve resmi tatil kaydırılır", () => {
    const t = (
      tur: "ODEME_EMRI" | "VERGI_CEZA_IHBARNAMESI" | "DIGER",
      ymd: string
    ) => sonIslemTarihi({ tur, ulasmaTarihi: ulasma(ymd) })
    expect(t("ODEME_EMRI", "2026-09-05")).toBe("2026-09-25")
    // 27 Eylül Pazar → Pazartesi
    expect(t("ODEME_EMRI", "2026-09-07")).toBe("2026-09-28")
    // 29 Ekim Cumhuriyet Bayramı → 30 Ekim
    expect(t("ODEME_EMRI", "2026-10-09")).toBe("2026-10-30")
    expect(t("VERGI_CEZA_IHBARNAMESI", "2026-09-05")).toBe("2026-10-12")
    // Süresi izlenmeyen tür
    expect(t("DIGER", "2026-09-05")).toBeUndefined()
    // Yazıdaki özel süre
    expect(
      sonIslemTarihi({
        tur: "BILGI_ISTEME",
        sureGun: 30,
        ulasmaTarihi: ulasma("2026-09-05"),
      })
    ).toBe("2026-10-12")
  })

  it("acil / gecikti yalnızca açık tebligatta", () => {
    const base = {
      tur: "ODEME_EMRI" as const,
      ulasmaTarihi: ulasma("2026-09-05"),
    }
    expect(sureDurumu({ ...base, durum: "YENI" }, "2026-09-23")).toMatchObject({
      kalanGun: 2,
      acil: true,
      gecikti: false,
    })
    expect(
      sureDurumu({ ...base, durum: "INCELENDI" }, "2026-09-26")
    ).toMatchObject({
      kalanGun: -1,
      gecikti: true,
      acil: false,
    })
    expect(
      sureDurumu({ ...base, durum: "ISLEM_YAPILDI" }, "2026-09-26")
    ).toMatchObject({
      acik: false,
      gecikti: false,
    })
  })
})

describe("GİB belge türü sınıflama", () => {
  it("GİB belge türü metninden tebligat türü", () => {
    expect(tebligatTuru("Ödeme Emri")).toBe("ODEME_EMRI")
    expect(tebligatTuru("VERGİ/CEZA İHBARNAMESİ")).toBe(
      "VERGI_CEZA_IHBARNAMESI"
    )
    expect(tebligatTuru("İzaha Davet Yazısı")).toBe("IZAHA_DAVET")
    expect(tebligatTuru("Bilgi ve Belge İsteme")).toBe("BILGI_ISTEME")
    expect(tebligatTuru("Defter ve Belgelerin İbrazı")).toBe("INCELEME")
    expect(tebligatTuru("Mükellefiyet bilgilendirmesi")).toBe("DIGER")
  })
})
