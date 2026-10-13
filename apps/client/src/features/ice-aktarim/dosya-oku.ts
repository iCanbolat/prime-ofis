/**
 * Tarayıcıda dosya okuma: tahakkuk PDF'inden metin, mizan Excel/CSV'sinden satırlar.
 * Kütüphaneler (pdf.js, SheetJS) büyük olduğu için yalnızca içe aktarım sırasında yüklenir.
 * Testlerde bu modül `vi.mock` ile değiştirilir; ayrıştırma mantığı `tahakkuk.ts` / `mizan.ts`'dedir.
 */

/**
 * PDF'in tüm sayfalarındaki metni satır satır döndürür. pdf.js metni parçalar hâlinde verir;
 * aynı dikey konumdaki (±2 birim) parçalar soldan sağa birleştirilerek satır elde edilir.
 */
export async function pdfMetni(dosya: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist")
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const yukleme = pdfjs.getDocument({
    data: new Uint8Array(await dosya.arrayBuffer()),
  })
  const belge = await yukleme.promise
  const satirlar: string[] = []
  try {
    for (let no = 1; no <= belge.numPages; no++) {
      const sayfa = await belge.getPage(no)
      const icerik = await sayfa.getTextContent()
      const parcalar = icerik.items
        .filter((i) => "str" in i && i.str.trim() !== "")
        .map((i) => {
          const p = i as { str: string; transform: number[] }
          return { metin: p.str, x: p.transform[4]!, y: p.transform[5]! }
        })
        // PDF'te y yukarı doğru artar: üstten alta, soldan sağa
        .sort((a, b) => b.y - a.y || a.x - b.x)

      let grup: typeof parcalar = []
      for (const p of parcalar) {
        if (grup.length && Math.abs(grup[0]!.y - p.y) > 2) {
          satirlar.push(satirBirlestir(grup))
          grup = []
        }
        grup.push(p)
      }
      if (grup.length) satirlar.push(satirBirlestir(grup))
    }
  } finally {
    await yukleme.destroy()
  }
  return satirlar.join("\n")
}

function satirBirlestir(grup: { metin: string; x: number }[]) {
  return grup
    .sort((a, b) => a.x - b.x)
    .map((p) => p.metin.trim())
    .join(" ")
}

/**
 * CSV metni: önce UTF-8 denenir; geçersizse eski paketlerin kullandığı Windows-1254 (Türkçe).
 */
export function csvCoz(veri: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(veri)
  } catch {
    return new TextDecoder("windows-1254").decode(veri)
  }
}

/** Excel (.xlsx, .xls) veya CSV dosyasının ilk sayfasını satır dizisi olarak okur */
export async function tabloSatirlari(dosya: File): Promise<unknown[][]> {
  const XLSX = await import("xlsx")
  const veri = await dosya.arrayBuffer()
  const kitap = /\.(csv|txt)$/i.test(dosya.name)
    ? // raw: hücreler metin kalır. Aksi halde SheetJS "33030,00" gibi Türkçe ondalıkları
      // binlik ayraçlı sayı sanıp 3303000'e çevirir (";" ayracı yine otomatik bulunur).
      XLSX.read(csvCoz(veri), { type: "string", raw: true })
    : XLSX.read(veri, { type: "array" })
  const ad = kitap.SheetNames[0]
  if (!ad) return []
  return XLSX.utils.sheet_to_json<unknown[]>(kitap.Sheets[ad]!, {
    header: 1,
    raw: true,
    defval: "",
  })
}
