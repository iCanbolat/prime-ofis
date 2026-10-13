/**
 * İstemci tarafı görsel küçültme: telefon fotoğrafları (4000+ px, 3-8 MB) yüklemeden önce
 * uzun kenarı en fazla `maksPiksel` olacak şekilde JPEG'e dönüştürülür. Tarayıcı görseli
 * çözemezse (ör. HEIC) veya sonuç büyürse orijinal dosya döner.
 */
export const MAKS_PIKSEL = 2000
const KALITE = 0.85

export function hedefBoyut(
  genislik: number,
  yukseklik: number,
  maks = MAKS_PIKSEL
) {
  const oran = Math.min(1, maks / Math.max(genislik, yukseklik))
  return {
    genislik: Math.round(genislik * oran),
    yukseklik: Math.round(yukseklik * oran),
  }
}

export async function gorselKucult(
  file: File,
  maks = MAKS_PIKSEL
): Promise<File> {
  if (!["image/jpeg", "image/png"].includes(file.type)) return file
  if (typeof createImageBitmap !== "function") return file
  try {
    const bitmap = await createImageBitmap(file)
    const { genislik, yukseklik } = hedefBoyut(
      bitmap.width,
      bitmap.height,
      maks
    )
    // Zaten küçük ve hafif: dokunma
    if (genislik === bitmap.width && file.size < 1.5 * 1024 * 1024) {
      bitmap.close()
      return file
    }
    const canvas = document.createElement("canvas")
    canvas.width = genislik
    canvas.height = yukseklik
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.fillStyle = "#fff" // PNG saydamlığı JPEG'de siyah olmasın
    ctx.fillRect(0, 0, genislik, yukseklik)
    ctx.drawImage(bitmap, 0, 0, genislik, yukseklik)
    bitmap.close()
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", KALITE)
    )
    if (!blob || blob.size >= file.size) return file
    const ad = file.name.replace(/\.(png|jpe?g)$/i, "") + ".jpg"
    return new File([blob], ad, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    })
  } catch {
    return file
  }
}
