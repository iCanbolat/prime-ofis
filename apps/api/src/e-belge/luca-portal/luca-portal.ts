import { NotImplementedException } from "@nestjs/common"

import type { EntegratorBerat, EntegratorFatura } from "@prime/shared/e-belge/entegrator-adapter"
import type {
  LucaFaturaSorgusu,
  LucaGirisSonucu,
  LucaKontorBakiyesi,
  LucaPortalAdapter,
  LucaPortalFirma,
  LucaPortalKimlik,
  LucaPortalOturum,
} from "@prime/shared/e-belge/luca-portal"

/**
 * Luca web portalı (`LucaPortalAdapter`, kurallar sözleşmenin başlık yorumunda). `LUCA_PORTAL=mock`
 * geliştirme ve testte taklit; `http` gerçek portal. Çağrılar `LucaOturumService` üzerinden sıralı
 * yapılır, doğrudan kullanılmaz.
 */
export abstract class LucaPortal implements LucaPortalAdapter {
  abstract giris(
    kimlik: LucaPortalKimlik,
    dogrulama?: { oturumId: string; kod: string }
  ): Promise<LucaGirisSonucu>
  abstract dogrulamaYenile(
    kimlik: LucaPortalKimlik
  ): Promise<{ oturumId: string; gorselDataUrl: string }>
  abstract firmalar(oturum: LucaPortalOturum): Promise<LucaPortalFirma[]>
  abstract faturalar(
    oturum: LucaPortalOturum,
    firmaId: string,
    sorgu: LucaFaturaSorgusu
  ): Promise<EntegratorFatura[]>
  abstract faturaIcerik(
    oturum: LucaPortalOturum,
    firmaId: string,
    ettn: string,
    format: "PDF" | "XML"
  ): Promise<string>
  abstract beratlar(
    oturum: LucaPortalOturum,
    firmaId: string,
    yil: string
  ): Promise<EntegratorBerat[]>
  abstract kontorBakiyesi(oturum: LucaPortalOturum): Promise<LucaKontorBakiyesi>
}

const PORTAL_YOK =
  "Gerçek Luca portalı bağlantısı henüz hazır değil (ekran keşfi bekleniyor)"

/**
 * Gerçek portal (Aşama B). Ön koşul: Luca kullanım koşullarının ve KVKK değerlendirmesinin
 * tamamlanması, gerçek hesapla alınan ekran kayıtları. Önce `undici` + çerez kavanozu denenir;
 * tarayıcı zorunluysa ayrı `worker` profili (Playwright, eşzamanlılık 1). Gizleme yapılmaz,
 * doğrulama ekranı personele iletilir.
 */
export class HttpLucaPortal extends LucaPortal {
  private yok(): never {
    throw new NotImplementedException({ message: PORTAL_YOK })
  }
  async giris(): Promise<LucaGirisSonucu> {
    return this.yok()
  }
  async dogrulamaYenile(): Promise<{ oturumId: string; gorselDataUrl: string }> {
    return this.yok()
  }
  async firmalar(): Promise<LucaPortalFirma[]> {
    return this.yok()
  }
  async faturalar(): Promise<EntegratorFatura[]> {
    return this.yok()
  }
  async faturaIcerik(): Promise<string> {
    return this.yok()
  }
  async beratlar(): Promise<EntegratorBerat[]> {
    return this.yok()
  }
  async kontorBakiyesi(): Promise<LucaKontorBakiyesi> {
    return this.yok()
  }
}
