/**
 * Resmi tatiller (tam gün). Arife gibi yarım günler iş günü sayılır; son gün yarım güne
 * denk gelirse kaydırılmaz. Dini bayram tarihleri Diyanet takvimine göre girilmiştir;
 * yeni yıl eklenirken resmi takvimle doğrulanmalıdır.
 */
export interface ResmiTatil {
  tarih: string
  ad: string
}

const sabit = (yil: number): ResmiTatil[] => [
  { tarih: `${yil}-01-01`, ad: "Yılbaşı" },
  { tarih: `${yil}-04-23`, ad: "Ulusal Egemenlik ve Çocuk Bayramı" },
  { tarih: `${yil}-05-01`, ad: "Emek ve Dayanışma Günü" },
  { tarih: `${yil}-05-19`, ad: "Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
  { tarih: `${yil}-07-15`, ad: "Demokrasi ve Milli Birlik Günü" },
  { tarih: `${yil}-08-30`, ad: "Zafer Bayramı" },
  { tarih: `${yil}-10-29`, ad: "Cumhuriyet Bayramı" },
]

const bayram = (ad: string, tarihler: string[]): ResmiTatil[] =>
  tarihler.map((tarih, i) => ({ tarih, ad: `${ad} ${i + 1}. gün` }))

export const RESMI_TATILLER: ResmiTatil[] = [
  ...sabit(2025),
  ...bayram("Ramazan Bayramı", ["2025-03-30", "2025-03-31", "2025-04-01"]),
  ...bayram("Kurban Bayramı", [
    "2025-06-06",
    "2025-06-07",
    "2025-06-08",
    "2025-06-09",
  ]),
  ...sabit(2026),
  ...bayram("Ramazan Bayramı", ["2026-03-20", "2026-03-21", "2026-03-22"]),
  ...bayram("Kurban Bayramı", [
    "2026-05-27",
    "2026-05-28",
    "2026-05-29",
    "2026-05-30",
  ]),
  ...sabit(2027),
  ...bayram("Ramazan Bayramı", ["2027-03-09", "2027-03-10", "2027-03-11"]),
  ...bayram("Kurban Bayramı", [
    "2027-05-16",
    "2027-05-17",
    "2027-05-18",
    "2027-05-19",
  ]),
]

export const TATIL_HARITASI: ReadonlyMap<string, string> = new Map(
  RESMI_TATILLER.map((t) => [t.tarih, t.ad])
)
