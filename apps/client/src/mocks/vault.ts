/**
 * Demo şifre kasası. Web Crypto asenkron olduğu için kasa senkron seed'e dahil edilmez;
 * ilk kasa isteğinde `ensureVault()` demo ana şifreyle meta + şifreli örnek kayıtları oluşturur
 * (plan `@prime/mock-data/kasa`, api seed'iyle ortak). DB sıfırlanınca kasa da boşalır ve bir
 * sonraki istekte yeniden oluşur.
 */
import { KDF_ITERATIONS } from "@/lib/crypto"
import { db } from "@/mocks/db"
import { demoKasasi } from "@prime/mock-data/kasa"

export {
  DEMO_KASA_SIFRESI,
  planCredentialSeeds,
  type PlainCredentialSeed,
} from "@prime/mock-data/kasa"

async function initVault() {
  const guncelleyenId =
    db.personel.all().find((p) => p.rol === "YONETICI")?.id ?? "p_1"
  const { meta, credentials } = await demoKasasi(db.mukellef.all(), {
    iterations: KDF_ITERATIONS,
    guncelleyenId,
  })
  for (const row of credentials) db.credential.insert(row)
  db.kasa.insert(meta)
}

let pending: Promise<void> | null = null

/** Kasa yoksa demo şifresiyle oluşturur. Eşzamanlı çağrılar aynı işlemi bekler. */
export function ensureVault(): Promise<void> {
  if (db.kasa.count() > 0) return Promise.resolve()
  pending ??= initVault().finally(() => {
    pending = null
  })
  return pending
}
