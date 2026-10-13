/**
 * Yönetim komutları (`pnpm --filter @prime/api cli <komut>`; container'da `node dist/cli.js <komut>`).
 *
 *   kurulum        Büroyu ve ilk yöneticiyi oluşturur (yalnızca boş veritabanında).
 *                  Değerler `--anahtar=değer` ile verilir, eksikler sorulur:
 *                  --buro-ad --vkn --vergi-dairesi --telefon --buro-eposta --adres
 *                  --ad --soyad --eposta --sifre (ya da KURULUM_SIFRESI ortam değişkeni)
 *   gizli:dondur   Şifreli kolonları SECRET_KEY_ESKI ile çözüp SECRET_KEY ile yeniden şifreler.
 */
import "reflect-metadata"

import { existsSync } from "node:fs"
import { createInterface } from "node:readline/promises"

import { Module } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { count, sql } from "drizzle-orm"

import { personelOlusturSemasi } from "@prime/shared/auth/schemas"
import { VARSAYILAN_SABLONLAR } from "@prime/shared/evrak-talebi/sabitler"

import { SifreService } from "./auth/sifre.service.js"
import { ConfigModule } from "./config/config.module.js"
import { CoreModule } from "./core/core.module.js"
import { newId } from "./core/id.js"
import { Saat } from "./core/saat.js"
import { GIZLI_KOLONLAR, SecretBox } from "./core/secret-box.js"
import { DB, DbModule, type Veritabani } from "./db/db.module.js"
import { aktivite, buro, personel, personelKimlik } from "./db/schema/index.js"

@Module({
  imports: [ConfigModule.forRoot(), CoreModule, DbModule],
  providers: [SifreService],
})
class CliModule {}

function argumanlar(): Record<string, string> {
  return Object.fromEntries(
    process.argv
      .slice(3)
      .flatMap((a) => {
        const m = /^--([\w-]+)=(.*)$/.exec(a)
        return m ? [[m[1]!, m[2]!]] : []
      })
  )
}

async function kurulum(db: Veritabani, sifreler: SifreService, saat: Saat) {
  const [mevcut] = await db.select({ n: count() }).from(buro)
  if (mevcut?.n) throw new Error("Kurulum zaten yapılmış: büro kaydı var")

  const arg = argumanlar()
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const sor = async (anahtar: string, soru: string) =>
    arg[anahtar] ?? (await rl.question(`${soru}: `)).trim()
  try {
    const b = {
      id: newId("b"),
      ad: await sor("buro-ad", "Büro adı"),
      vkn: await sor("vkn", "Büro VKN"),
      vergiDairesi: await sor("vergi-dairesi", "Vergi dairesi"),
      telefon: await sor("telefon", "Büro telefonu"),
      eposta: await sor("buro-eposta", "Büro e-postası"),
      adres: await sor("adres", "Adres"),
      mesajSablonlari: { ...VARSAYILAN_SABLONLAR },
    }
    if (!b.ad) throw new Error("Büro adı zorunludur")

    const yonetici = personelOlusturSemasi.safeParse({
      ad: await sor("ad", "Yönetici adı"),
      soyad: await sor("soyad", "Yönetici soyadı"),
      eposta: await sor("eposta", "Yönetici e-postası (giriş)"),
      telefon: "",
      rol: "YONETICI",
      renk: "blue",
      aktif: true,
      sifre: arg.sifre ?? process.env.KURULUM_SIFRESI ?? (await rl.question("Şifre: ")),
    })
    if (!yonetici.success) throw new Error(yonetici.error.issues[0]?.message)
    const { sifre, ...bilgi } = yonetici.data
    const hash = await sifreler.ozetle(sifre)

    await db.transaction(async (tx) => {
      await tx.insert(buro).values(b)
      const p = { id: newId("p"), ...bilgi }
      await tx.insert(personel).values(p)
      await tx
        .insert(personelKimlik)
        .values({ personelId: p.id, hash, guncelleme: saat.simdiIso() })
      await tx.insert(aktivite).values({
        id: newId("a"),
        aktorId: "sistem",
        eylem: "PERSONEL_EKLENDI",
        aciklama: `${p.ad} ${p.soyad}`,
        zaman: saat.simdiIso(),
      })
    })
    console.log(`Kurulum tamam: ${b.ad}, yönetici ${bilgi.eposta}`)
  } finally {
    rl.close()
  }
}

async function gizliDondur(db: Veritabani, kutu: SecretBox) {
  let toplam = 0
  for (const { tablo, idKolonu, kolon } of GIZLI_KOLONLAR) {
    const { rows } = await db.execute<{ id: string; deger: string }>(
      sql.raw(
        `select "${idKolonu}" as id, "${kolon}" as deger from "${tablo}" where "${kolon}" is not null`
      )
    )
    for (const { id, deger } of rows) {
      if (kutu.guncelMi(deger)) continue
      const yeni = kutu.sifrele(kutu.coz(deger))
      await db.execute(
        sql`update ${sql.identifier(tablo)} set ${sql.identifier(kolon)} = ${yeni} where ${sql.identifier(idKolonu)} = ${id}`
      )
      toplam++
    }
  }
  console.log(
    GIZLI_KOLONLAR.length
      ? `${toplam} değer yeni anahtarla şifrelendi. SECRET_KEY_ESKI kaldırılabilir.`
      : "Şifreli kolon tanımlı değil; yapılacak bir şey yok."
  )
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env")
  const komut = process.argv[2]
  if (komut !== "kurulum" && komut !== "gizli:dondur") {
    console.error("Kullanım: cli <kurulum | gizli:dondur> [--anahtar=değer …]")
    process.exit(1)
  }
  const app = await NestFactory.createApplicationContext(CliModule, {
    logger: ["error", "warn"],
  })
  try {
    const db = app.get<Veritabani>(DB)
    if (komut === "kurulum") await kurulum(db, app.get(SifreService), app.get(Saat))
    else await gizliDondur(db, app.get(SecretBox))
  } finally {
    await app.close()
  }
}

main().catch((hata: unknown) => {
  console.error(hata instanceof Error ? hata.message : hata)
  process.exit(1)
})
