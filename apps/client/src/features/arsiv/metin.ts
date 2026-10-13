/** Türkçe büyük/küçük harf duyarsız içerme (İ/ı doğru eşleşir). */
export function turkceIcerir(metin: string, aranan: string) {
  return metin
    .toLocaleLowerCase("tr-TR")
    .includes(aranan.trim().toLocaleLowerCase("tr-TR"))
}
