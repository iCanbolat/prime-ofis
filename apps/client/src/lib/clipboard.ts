export const PANO_TEMIZLEME_MS = 30_000

let temizlemeZamanlayici: ReturnType<typeof setTimeout> | undefined

/**
 * Metni panoya kopyalar ve belirtilen süre sonra panoyu temizler.
 * Pano okunabiliyorsa yalnızca içerik hâlâ bizim kopyaladığımız metinse temizler
 * (kullanıcının sonradan kopyaladığı başka bir şeyi silmemek için).
 */
export async function copyWithAutoClear(
  text: string,
  clearAfterMs = PANO_TEMIZLEME_MS
) {
  await navigator.clipboard.writeText(text)
  clearTimeout(temizlemeZamanlayici)
  temizlemeZamanlayici = setTimeout(async () => {
    try {
      const current = await navigator.clipboard.readText()
      if (current !== text) return
    } catch {
      // Okuma izni yok: güvenli tarafta kal, temizle
    }
    await navigator.clipboard.writeText("").catch(() => {})
  }, clearAfterMs)
}
