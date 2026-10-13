/** Dosyayı base64 data URL olarak okur */
export function dataUrlOku(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Dosya okunamadı"))
    reader.readAsDataURL(file)
  })
}

/** Blob'u verilen adla indirir (geçici `<a download>` üzerinden) */
export function dosyaIndir(blob: Blob, ad: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = ad
  document.body.append(a)
  a.click()
  a.remove()
  // Tarayıcı indirmeyi başlatana kadar URL geçerli kalmalı
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
