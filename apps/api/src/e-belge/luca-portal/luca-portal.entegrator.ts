import { ConflictException } from "@nestjs/common"
import { subDays } from "date-fns"

import type {
  BaglantiDogrulamaSonucu,
  EntegratorBerat,
  EntegratorFatura,
  EntegratorKimlik,
  FaturaSorgusu,
} from "@prime/shared/e-belge/entegrator-adapter"
import { ublKalemleri } from "@prime/shared/e-belge/ubl-kalemler"
import { toYmd } from "@prime/shared/lib/tarih"
import type { EBelgeKalem } from "@prime/shared/types/api"

import { Saat } from "../../core/saat.js"
import { Entegrator } from "../entegrator.js"
import { LucaOturumService } from "./luca-oturum.service.js"
import { LucaPortal } from "./luca-portal.js"

/** Artımlı senkronda son senkrondan geriye bakılan gün (portalda geç işlenen durum değişiklikleri) */
const GERI_BAKIS_GUN = 7
/** İlk senkronda alınan dönem */
const ILK_SENKRON_GUN = 90

/**
 * Luca portalı üzerinden entegratör: her mükellef büro Luca hesabındaki bir firmaya eşlenir
 * (`kimlik.lucaFirmaId`). Salt okunur: ticari yanıt Luca'da verilir.
 */
export class LucaPortalEntegrator extends Entegrator {
  constructor(
    private readonly oturum: LucaOturumService,
    private readonly portal: LucaPortal,
    private readonly saat: Saat
  ) {
    super()
  }

  async baglantiDogrula({ lucaFirmaId }: EntegratorKimlik): Promise<BaglantiDogrulamaSonucu> {
    const f = lucaFirmaId ? await this.oturum.firma(lucaFirmaId) : undefined
    if (!f)
      return {
        gecerli: false,
        hataMesaji: "Firma Luca hesabında bulunamadı",
        eFatura: false,
        eArsiv: false,
        eDefter: false,
      }
    return {
      gecerli: true,
      eFatura: f.eFatura,
      eArsiv: f.eArsiv,
      eDefter: f.eDefter,
      ...(f.postaKutusu ? { postaKutusu: f.postaKutusu } : {}),
    }
  }

  async faturalariGetir(k: EntegratorKimlik, { tur, yon, sonra }: FaturaSorgusu) {
    const firmaId = this.firma(k)
    const bugun = this.saat.simdi()
    const baslangic = sonra ? subDays(new Date(sonra), GERI_BAKIS_GUN) : subDays(bugun, ILK_SENKRON_GUN)
    return this.oturum.calistir(
      (o): Promise<EntegratorFatura[]> =>
        this.portal.faturalar(o, firmaId, {
          tur,
          yon,
          baslangic: toYmd(baslangic),
          bitis: toYmd(bugun),
        })
    )
  }

  async faturaKalemleri(k: EntegratorKimlik, ettn: string): Promise<EBelgeKalem[]> {
    return ublKalemleri(await this.faturaIcerik(k, ettn, "XML"))
  }

  async faturaIcerik(k: EntegratorKimlik, ettn: string, format: "PDF" | "XML") {
    const firmaId = this.firma(k)
    return this.oturum.calistir((o) => this.portal.faturaIcerik(o, firmaId, ettn, format))
  }

  async beratDurumlari(k: EntegratorKimlik, yil: string): Promise<EntegratorBerat[]> {
    const firmaId = this.firma(k)
    return this.oturum.calistir((o) => this.portal.beratlar(o, firmaId, yil))
  }

  /** Senkron sonunda büronun Luca kontör bakiyesi */
  async kontorBakiyesiOku() {
    const { kalan } = await this.oturum.calistir((o) => this.portal.kontorBakiyesi(o))
    await this.oturum.kontorYaz(kalan)
    return kalan
  }

  private firma(k: EntegratorKimlik) {
    if (!k.lucaFirmaId)
      throw new ConflictException({ message: "Mükellef bir Luca firmasıyla eşlenmemiş" })
    return k.lucaFirmaId
  }
}
