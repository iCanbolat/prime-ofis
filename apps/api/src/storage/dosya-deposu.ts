/**
 * Nesne deposu soyutlaması. Üretimde MinIO (S3 API), testte bellek içi.
 * Anahtar düzeni Faz 1'de: `arsiv/{mukellefId}/{dosyaId}`, `gelen/{talepId}/{gelenId}`.
 */
export abstract class DosyaDeposu {
  abstract koy(anahtar: string, icerik: Buffer, mimeType: string): Promise<void>
  /** Nesne yoksa `null` */
  abstract getir(anahtar: string): Promise<Buffer | null>
  abstract sil(anahtar: string): Promise<void>
  abstract kopyala(kaynak: string, hedef: string): Promise<void>
  /** Sağlık kontrolü: depo erişilebilir mi */
  abstract ping(): Promise<void>
}

export class BellekDosyaDeposu extends DosyaDeposu {
  readonly nesneler = new Map<string, { icerik: Buffer; mimeType: string }>()

  async koy(anahtar: string, icerik: Buffer, mimeType: string) {
    this.nesneler.set(anahtar, { icerik: Buffer.from(icerik), mimeType })
  }
  async getir(anahtar: string) {
    return this.nesneler.get(anahtar)?.icerik ?? null
  }
  async sil(anahtar: string) {
    this.nesneler.delete(anahtar)
  }
  async kopyala(kaynak: string, hedef: string) {
    const n = this.nesneler.get(kaynak)
    if (!n) throw new Error(`Nesne yok: ${kaynak}`)
    this.nesneler.set(hedef, { ...n })
  }
  async ping() {}
}
