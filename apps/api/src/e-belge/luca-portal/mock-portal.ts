import { TransactionHost } from "@nestjs-cls/transactional"
import { eq } from "drizzle-orm"

import { kontorBakiyesi } from "@prime/shared/e-belge/kontor"
import { toYmd } from "@prime/shared/lib/tarih"
import type { EBelge, EDefterBerat, KontorAlim } from "@prime/shared/types/domain"
import { mockLucaPortal, type MockLucaPortal } from "@prime/mock-data/luca-portal"

import { nullsuz } from "../../core/nullsuz.js"
import { Saat } from "../../core/saat.js"
import type { DrizzleTx } from "../../db/db.module.js"
import { ebelge, edefterBerat, entegratorBaglanti, kontorAlim, mukellef } from "../../db/schema/index.js"

/**
 * Mock Luca portalı (`@prime/mock-data/luca-portal`): firmalar aktif mükelleflerden ve sabit ek
 * firmalardan, fatura / berat güncellemeleri veritabanındaki mevcut durumdan, kontör bakiyesi
 * veritabanından.
 */
export function apiMockLucaPortal(txHost: TransactionHost<DrizzleTx>, saat: Saat): MockLucaPortal {
  const tx = () => txHost.tx
  return mockLucaPortal({
    mukellefler: async () =>
      (await tx().select().from(mukellef).where(eq(mukellef.aktif, true))).map((m) => ({
        id: m.id,
        unvan: m.unvan,
        eposta: m.eposta,
        tur: m.tur,
        eDefterMukellefi: m.eDefterMukellefi,
        vergiDairesi: m.vergiDairesi,
        il: m.il,
        ilce: m.ilce,
        adres: m.adres,
        telefon: m.telefon,
        ...(m.vkn ? { vkn: m.vkn } : {}),
        ...(m.tckn ? { tckn: m.tckn } : {}),
      })),
    firmaMukellefi: async (firmaId) => {
      const [b] = await tx()
        .select({ mukellefId: entegratorBaglanti.mukellefId })
        .from(entegratorBaglanti)
        .where(eq(entegratorBaglanti.lucaFirmaId, firmaId))
      return b?.mukellefId
    },
    faturalar: async (mukellefId) =>
      (await tx().select().from(ebelge).where(eq(ebelge.mukellefId, mukellefId))).map(
        (e) => nullsuz(e) as EBelge
      ),
    fatura: async (ettn) => {
      const [f] = await tx().select().from(ebelge).where(eq(ebelge.ettn, ettn))
      return f ? (nullsuz(f) as EBelge) : undefined
    },
    beratlar: async (mukellefId) =>
      (await tx().select().from(edefterBerat).where(eq(edefterBerat.mukellefId, mukellefId))).map(
        (b) => ({ id: `${b.mukellefId}:${b.donem}`, ...nullsuz(b) }) as EDefterBerat
      ),
    kontorKalan: async () => {
      const alimlar = (await tx().select().from(kontorAlim)).map((a) => nullsuz(a) as KontorAlim)
      const belgeler = (await tx().select().from(ebelge)).map((e) => nullsuz(e) as EBelge)
      return kontorBakiyesi(alimlar, belgeler, toYmd(saat.simdi())).kalan
    },
    simdi: () => saat.simdi(),
  })
}
