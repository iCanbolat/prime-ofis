import { NotImplementedException } from "@nestjs/common"

import type {
  KamuGirisSonucu,
  KamuKimlik,
  KamuOturum,
  KamuSorguAdapter,
} from "@prime/shared/borc/kamu-adapter"
import type {
  GibTaramaSonucu,
  GibTebligatAdapter,
} from "@prime/shared/tebligat/gib-adapter"
import { mockGibAdapter } from "@prime/mock-data/gib-tebligat"
import { mockKamuAdapter } from "@prime/mock-data/kamu/mock-adapter"

import type { Saat } from "../core/saat.js"

/**
 * Kamu girişi (`KamuSorguAdapter.giris` / `dogrulamaYenile`): GİB İnteraktif VD oturumu e-Tebligat
 * ile borç / levha sorgularında (Faz 11) ortaktır. Doğrulama ekranı otomatik geçilmez. Doğrudan
 * kullanılmaz, `GibOturumService` üzerinden.
 */
export abstract class KamuGiris
  implements Pick<KamuSorguAdapter, "giris" | "dogrulamaYenile">
{
  abstract giris(
    kimlik: KamuKimlik,
    dogrulama?: { oturumId: string; kod: string }
  ): Promise<KamuGirisSonucu>
  abstract dogrulamaYenile(kimlik: KamuKimlik): Promise<{ oturumId: string; gorselDataUrl: string }>
}

/** GİB e-Tebligat kutusu (açık oturumla, salt okunur) */
export abstract class GibTebligat implements GibTebligatAdapter {
  abstract yeniBelgeler(oturum: KamuOturum, sonrasi: string | undefined): Promise<GibTaramaSonucu>
}

const GERCEK_YOK = "Gerçek GİB bağlantısı henüz yok (Faz 12); GIB_ADAPTER=mock kullanın"

export class HttpKamuGiris extends KamuGiris {
  giris(): Promise<KamuGirisSonucu> {
    throw new NotImplementedException({ message: GERCEK_YOK })
  }
  dogrulamaYenile(): Promise<{ oturumId: string; gorselDataUrl: string }> {
    throw new NotImplementedException({ message: GERCEK_YOK })
  }
}

export class HttpGibTebligat extends GibTebligat {
  yeniBelgeler(): Promise<GibTaramaSonucu> {
    throw new NotImplementedException({ message: GERCEK_YOK })
  }
}

/** Mock'lar test saatini kullanır (deterministik üretim `@prime/mock-data`) */
export function apiMockKamuGiris(saat: Saat): KamuGiris {
  const m = mockKamuAdapter(() => saat.simdi())
  return { giris: m.giris.bind(m), dogrulamaYenile: m.dogrulamaYenile.bind(m) }
}

export function apiMockGibTebligat(saat: Saat): GibTebligat {
  return mockGibAdapter(() => saat.simdi())
}
