import type {
  BaglantiDogrulamaSonucu,
  EntegratorAdapter,
  EntegratorBerat,
  EntegratorFatura,
  EntegratorKimlik,
  FaturaSorgusu,
} from "@prime/shared/e-belge/entegrator-adapter"
import type { EBelgeKalem } from "@prime/shared/types/api"

/**
 * e-Belge entegratörü (`EntegratorAdapter`). Tek uygulama Luca portalıdır
 * (`luca-portal/luca-portal.entegrator.ts`); soyut sınıf DI belirteci ve test kancasıdır.
 */
export abstract class Entegrator implements EntegratorAdapter {
  abstract baglantiDogrula(kimlik: EntegratorKimlik): Promise<BaglantiDogrulamaSonucu>
  abstract faturalariGetir(kimlik: EntegratorKimlik, sorgu: FaturaSorgusu): Promise<EntegratorFatura[]>
  abstract faturaKalemleri(kimlik: EntegratorKimlik, ettn: string): Promise<EBelgeKalem[]>
  abstract faturaIcerik(kimlik: EntegratorKimlik, ettn: string, format: "PDF" | "XML"): Promise<string>
  abstract beratDurumlari(kimlik: EntegratorKimlik, yil: string): Promise<EntegratorBerat[]>
  /** Senkron sonunda entegratörün bildirdiği büro kontör bakiyesi */
  abstract kontorBakiyesiOku(): Promise<number | null>
}
