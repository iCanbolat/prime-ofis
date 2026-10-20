/**
 * Luca web portalı sözleşmesi: **backend** tarafından uygulanır. TÜRMOB-Luca'nın belgeli bir
 * entegratör arayüzü olmadığı için e-belge verisi, büronun kendi Luca kullanıcısıyla açılan portal
 * oturumundan okunur. Frontend portala erişmez, yalnızca `/api/luca-hesap`, `/api/luca-dogrulama`
 * ve `/api/e-belge/*` uçlarını bilir.
 *
 * Kurallar:
 * - Tek mod budur: her büro Luca'ya bu yolla bağlanır; mükellefler Luca firmalarından oluşturulur
 *   ya da firmalara eşlenir (`luca-mukellef.ts`).
 * - **Salt okunur.** Ticari kabul / red, fatura kesme gibi işlemler Luca'da elle yapılır.
 * - **Doğrulama ekranı (CAPTCHA) otomatik geçilmez.** Çözücü servis, görüntü tanıma ya da tarayıcı
 *   gizleme (stealth, sahte user-agent) kullanılmaz. Giriş doğrulama isterse `DOGRULAMA` döner;
 *   backend görseli personele gösterir, personelin girdiği kodla `giris(kimlik, { oturumId, kod })`
 *   çağrılır. Kamu sorgularıyla aynı akış (`borc/kamu-adapter.ts`).
 * - Gece senkronu yok: senkronu personel başlatır. Oturum yalnızca Luca'nın tanıdığı süre boyunca
 *   kullanılır, "canlı tutma" isteği atılmaz.
 * - İstekler sıralı ve hız sınırlıdır. Başarısız girişten sonra, hesap kilitlenmesin diye şifre
 *   güncellenene kadar yeniden giriş denenmez.
 * - Şifre yalnızca backend'de (SecretBox ile şifreli) tutulur. Doğrulama görseli kısa ömürlüdür
 *   ve loglanmaz.
 */
import type { EntegratorBerat, EntegratorFatura } from "./entegrator-adapter"
import type { EBelgeTur, EBelgeYon, MukellefTur } from "../types/domain"

export interface LucaPortalKimlik {
  /** Luca kullanıcı adı (TCKN ya da kullanıcı kodu) */
  kullanici: string
  sifre: string
}

/** Portalda açık oturum (backend'de çerez kavanozu); istemciye çıkmaz */
export interface LucaPortalOturum {
  oturumId: string
}

export type LucaGirisSonucu =
  | { durum: "TAMAM"; oturum: LucaPortalOturum }
  | { durum: "HATA"; hataMesaji: string }
  | {
      durum: "DOGRULAMA"
      /** Portalın doğrulama oturumu; kodla birlikte geri verilir */
      oturumId: string
      gorselDataUrl: string
    }

/** Luca kullanıcısının erişebildiği firma (büronun mükellefi) */
export interface LucaPortalFirma {
  firmaId: string
  unvan: string
  vknTckn?: string
  /** Luca firma kartı; mükellef oluştururken kullanılır */
  tur?: MukellefTur
  vergiDairesi?: string
  il?: string
  ilce?: string
  adres?: string
  telefon?: string
  eposta?: string
  eFatura: boolean
  eArsiv: boolean
  eDefter: boolean
  postaKutusu?: string
}

export interface LucaFaturaSorgusu {
  tur: EBelgeTur
  yon: EBelgeYon
  /** YYYY-MM-DD, dahil */
  baslangic: string
  bitis: string
}

export interface LucaKontorBakiyesi {
  kalan: number
}

/** Oturum düştüğünde adaptör bunu fırlatır; çağıran bir kez yeniden giriş dener */
export class LucaOturumDustu extends Error {
  override readonly name = "LucaOturumDustu"
  constructor() {
    super("Luca oturumu sona erdi")
  }
}

/** Paket sınırında (ayrı derlenmiş kopyalar) `instanceof` güvenilmez; ada bakılır */
export const lucaOturumDustuMu = (e: unknown): e is LucaOturumDustu =>
  e instanceof Error && e.name === "LucaOturumDustu"

export interface LucaPortalAdapter {
  giris(
    kimlik: LucaPortalKimlik,
    dogrulama?: { oturumId: string; kod: string }
  ): Promise<LucaGirisSonucu>
  /** Yeni doğrulama görseli (öncekinin süresi dolunca) */
  dogrulamaYenile(
    kimlik: LucaPortalKimlik
  ): Promise<{ oturumId: string; gorselDataUrl: string }>
  firmalar(oturum: LucaPortalOturum): Promise<LucaPortalFirma[]>
  faturalar(
    oturum: LucaPortalOturum,
    firmaId: string,
    sorgu: LucaFaturaSorgusu
  ): Promise<EntegratorFatura[]>
  /** PDF ya da UBL XML (data URL) */
  faturaIcerik(
    oturum: LucaPortalOturum,
    firmaId: string,
    ettn: string,
    format: "PDF" | "XML"
  ): Promise<string>
  beratlar(
    oturum: LucaPortalOturum,
    firmaId: string,
    yil: string
  ): Promise<EntegratorBerat[]>
  kontorBakiyesi(oturum: LucaPortalOturum): Promise<LucaKontorBakiyesi>
}
