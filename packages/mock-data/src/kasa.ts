/**
 * Demo şifre kasası: demo ana şifreyle meta + şifreli örnek kayıtlar. Client MSW (`mocks/vault.ts`,
 * ilk kasa isteğinde) ve api seed'i (dev reset, testler) aynı planı kullanır. Sunucu yalnızca
 * şifreli veriyi saklar; düz şifreler yalnızca bu planda ve testlerde bulunur.
 */
import { Faker, base, en, tr } from "@faker-js/faker"

import {
  KDF_ITERATIONS,
  createVerifier,
  deriveKey,
  encryptJson,
  generateSalt,
} from "@prime/shared/kasa/kripto"
import type {
  Credential,
  CredentialSecret,
  KasaMeta,
  Mukellef,
  Sistem,
} from "@prime/shared/types/domain"

import { DEFAULT_SEED, SEED_REF_DATE } from "./seed"

/** Demo ortamında kasa kilidini açan ana şifre (giriş ekranında da gösterilir). */
export const DEMO_KASA_SIFRESI = "demo1234"

export interface PlainCredentialSeed extends CredentialSecret {
  mukellefId: string
  sistem: Sistem
  kullaniciAdi: string
  not?: string
}

/**
 * Mükellef listesinden deterministik örnek şifreler üretir. Bilinçli olarak bazı sistemler
 * eksik bırakılır (kasa ekranındaki "eksik" vurgusu için).
 */
export function planCredentialSeeds(
  mukellefler: Mukellef[],
  seed: number = DEFAULT_SEED
): PlainCredentialSeed[] {
  const faker = new Faker({ locale: [tr, en, base] })
  faker.seed(seed)
  faker.setDefaultRefDate(SEED_REF_DATE)
  const password = () =>
    faker.internet.password({ length: 10, memorable: false })

  return mukellefler.flatMap((m, index) => {
    const seeds: PlainCredentialSeed[] = [
      {
        mukellefId: m.id,
        sistem: "GIB",
        kullaniciAdi: faker.string.numeric(8),
        sifre: password(),
        ekSifre: faker.string.numeric(6),
      },
    ]
    if (index % 4 !== 3) {
      seeds.push({
        mukellefId: m.id,
        sistem: "IVD",
        kullaniciAdi: m.vkn ?? m.tckn ?? "",
        sifre: password(),
      })
    }
    if (m.sgkIsyeriVar && index % 3 !== 2) {
      const kullaniciAdi = faker.string.numeric(11)
      seeds.push(
        {
          mukellefId: m.id,
          sistem: "SGK",
          kullaniciAdi,
          sifre: password(),
          ekSifre: password(),
        },
        {
          mukellefId: m.id,
          sistem: "EBILDIRGE",
          kullaniciAdi,
          sifre: password(),
          ekSifre: password(),
          not: "İşyeri kodu SGK kartındaki ile aynı",
        }
      )
    }
    return seeds
  })
}

export interface KasaKurulumu {
  meta: Omit<KasaMeta, "id">
  credentials: Omit<Credential, "id">[]
}

/** Kasa meta'sını oluşturur ve verilen düz kayıtları ana şifreden türetilen anahtarla şifreler. */
export async function kasaKur(
  masterPassword: string,
  seeds: PlainCredentialSeed[],
  {
    iterations = KDF_ITERATIONS,
    guncelleyenId,
    zaman = new Date().toISOString(),
  }: { iterations?: number; guncelleyenId: string; zaman?: string }
): Promise<KasaKurulumu> {
  const salt = generateSalt()
  const key = await deriveKey(masterPassword, salt, iterations)
  const credentials = await Promise.all(
    seeds.map(
      async ({ mukellefId, sistem, kullaniciAdi, not, sifre, ekSifre }) => ({
        mukellefId,
        sistem,
        kullaniciAdi,
        ...(not ? { not } : {}),
        ...(await encryptJson(
          { sifre, ekSifre } satisfies CredentialSecret,
          key
        )),
        sonGuncelleme: zaman,
        guncelleyenId,
      })
    )
  )
  return {
    meta: {
      salt,
      iterations,
      verifier: await createVerifier(key),
      olusturmaTarihi: zaman,
    },
    credentials,
  }
}

/** Demo kasası: verilen mükelleflerin örnek şifreleri, demo ana şifreyle */
export function demoKasasi(
  mukellefler: Mukellef[],
  secenek: Parameters<typeof kasaKur>[2]
) {
  return kasaKur(DEMO_KASA_SIFRESI, planCredentialSeeds(mukellefler), secenek)
}
