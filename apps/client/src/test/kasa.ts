import { useVaultStore } from "@/features/kasa/store"
import { deriveKey } from "@/lib/crypto"
import { http } from "@/lib/http"
import { FIXTURE_MUKELLEFLER } from "@prime/mock-data/fixtures"
import { DEMO_KASA_SIFRESI, planCredentialSeeds } from "@/mocks/vault"
import type { KasaMetaResponse } from "@prime/shared/types/api"
import type { Sistem } from "@prime/shared/types/domain"

/** Demo kasanın anahtarını türetir (kasa yoksa oluşturulur). */
export async function demoKasaAnahtari() {
  const meta = await http.get<KasaMetaResponse>("/kasa/meta")
  return deriveKey(DEMO_KASA_SIFRESI, meta.salt, meta.iterations)
}

/** Kilit penceresini atlayıp kasayı doğrudan açar. */
export async function kasayiAc() {
  const key = await demoKasaAnahtari()
  useVaultStore.getState().unlock(key)
  return key
}

/** Fixture mükellefleri için seed'lenen düz şifre (testte beklenen değer). */
export function fixtureSifresi(mukellefId: string, sistem: Sistem) {
  const seed = planCredentialSeeds(FIXTURE_MUKELLEFLER).find(
    (s) => s.mukellefId === mukellefId && s.sistem === sistem
  )
  if (!seed) throw new Error(`Seed yok: ${mukellefId} ${sistem}`)
  return seed
}
