import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"

import { lucaExcelOlustur } from "@/features/fis-aktarimi/luca-excel"
import { VARSAYILAN_LUCA_SABLONU } from "@prime/shared/fis-aktarimi/sabitler"

describe("lucaExcelOlustur", () => {
  it("başlık satırı ve sayı hücreli tutarlarla okunabilir bir xlsx üretir", async () => {
    const blob = await lucaExcelOlustur(
      [
        {
          tarih: "2026-08-14",
          aciklama: "Shell",
          evrakNo: "SH1",
          evrakTarihi: "2026-08-14",
          satirlar: [
            {
              hesapKodu: "770.01",
              aciklama: "matrah",
              borc: 1000.5,
              alacak: 0,
            },
            { hesapKodu: "102.01", aciklama: "ödeme", borc: 0, alacak: 1000.5 },
          ],
        },
      ],
      {
        ...VARSAYILAN_LUCA_SABLONU,
        sutunlar: [
          { alan: "FIS_NO", baslik: "FIS_NO" },
          { alan: "FIS_TARIHI", baslik: "FIS_TARIHI" },
          { alan: "HESAP_KODU", baslik: "HESAP_KODU" },
          { alan: "BORC", baslik: "BORC" },
          { alan: "ALACAK", baslik: "ALACAK" },
        ],
      }
    )
    expect(blob.type).toContain("spreadsheetml")

    const kitap = XLSX.read(new Uint8Array(await blob.arrayBuffer()), {
      type: "array",
    })
    const sayfa = kitap.Sheets[kitap.SheetNames[0]!]!
    expect(XLSX.utils.sheet_to_json(sayfa, { header: 1 })).toEqual([
      ["FIS_NO", "FIS_TARIHI", "HESAP_KODU", "BORC", "ALACAK"],
      [1, "14.08.2026", "770.01", 1000.5, 0],
      [1, "14.08.2026", "102.01", 0, 1000.5],
    ])
    // Tutarlar metin değil sayı hücresi
    expect(sayfa["D2"]?.t).toBe("n")
    // Hesap kodu metin kalır (770.01 sayıya dönüşüp 770.1 olmamalı)
    expect(sayfa["C2"]?.t).toBe("s")
  })
})
