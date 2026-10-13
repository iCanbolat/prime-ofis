import type { Faker } from "@faker-js/faker"
import { subHours } from "date-fns"

import { adresMaskele } from "@prime/shared/kanal/kurallar"
import type {
  BildirimTercihi,
  Gonderim,
  KanalAyari,
  Mukellef,
  Personel,
} from "@prime/shared/types/domain"

/** Seed referans anı (SEED_REF_DATE) */
const REFERANS = new Date("2026-09-01T09:00:00.000Z")

export interface KanalSeed {
  kanal: KanalAyari[]
  bildirimTercihi: BildirimTercihi[]
  gonderim: Gonderim[]
}

/**
 * E-posta ve Telegram bağlı; WhatsApp Business yapılandırılmamış (mükellef gönderimleri wa.me
 * bağlantısına düşer). Yönetici Telegram'ı bağlamış. Son 30 günden ~30 gönderim, 2'si hatalı.
 */
export function createKanalVerisi(
  faker: Faker,
  personel: Personel[],
  mukellefler: Mukellef[]
): KanalSeed {
  const kanal: KanalAyari[] = [
    {
      id: "EPOSTA",
      tip: "EPOSTA",
      aktif: true,
      durum: "BAGLI",
      sunucu: "smtp.yandex.com.tr",
      port: 587,
      guvenlik: "STARTTLS",
      kullanici: "bildirim@primemusavirlik.com.tr",
      gonderenAd: "Prime Mali Müşavirlik",
      gonderenAdres: "bildirim@primemusavirlik.com.tr",
      gizliIpucu: "k29X",
      sonTest: "2026-08-20T08:00:00.000Z",
      guncelleyenId: "p_1",
      guncellemeTarihi: "2026-01-10T09:00:00.000Z",
    },
    {
      id: "TELEGRAM",
      tip: "TELEGRAM",
      aktif: true,
      durum: "BAGLI",
      botKullaniciAdi: "PrimeOfisBot",
      gizliIpucu: "Qe7w",
      sonTest: "2026-08-20T08:05:00.000Z",
      guncelleyenId: "p_1",
      guncellemeTarihi: "2026-01-10T09:10:00.000Z",
    },
  ]

  const bildirimTercihi: BildirimTercihi[] = [
    {
      id: "p_1",
      kanallar: {
        uyari: ["EPOSTA", "TELEGRAM"],
        tebligat: ["EPOSTA", "TELEGRAM"],
        tahsilat: ["EPOSTA"],
      },
      telegramChatId: "581234907",
    },
  ]

  const aktifler = mukellefler.filter((m) => m.aktif)
  const gonderim: Gonderim[] = []
  for (let i = 0; i < 30; i++) {
    const zaman = subHours(REFERANS, faker.number.int({ min: 2, max: 30 * 24 }))
    const hata = i === 7 || i === 19
    if (faker.number.float() < 0.55) {
      const p = faker.helpers.arrayElement(personel)
      const tip =
        p.id === "p_1" && faker.number.float() < 0.5 ? "TELEGRAM" : "EPOSTA"
      const baslik = faker.helpers.arrayElement([
        "3 beyanın son gününe 2 gün kaldı",
        "Görevin son tarihi geçti",
        "Yeni e-Tebligat",
        "e-Tebligat süresinin dolmasına 3 gün kaldı",
      ])
      gonderim.push({
        id: `gn_${String(i + 1).padStart(3, "0")}`,
        kanal: tip,
        aliciTip: "PERSONEL",
        aliciId: p.id,
        aliciAd: `${p.ad} ${p.soyad}`,
        adres: adresMaskele(tip, tip === "EPOSTA" ? p.eposta : "581234907"),
        konu: baslik,
        ozet: baslik,
        durum: hata ? "HATA" : "GONDERILDI",
        hataMesaji: hata ? "SMTP bağlantısı zaman aşımına uğradı" : undefined,
        kaynak: "BILDIRIM",
        denemeSayisi: hata ? 3 : 1,
        zaman: zaman.toISOString(),
      })
    } else {
      const m = faker.helpers.arrayElement(aktifler)
      const eposta = faker.number.float() < 0.4
      const kaynak = faker.helpers.arrayElement([
        "TALEP",
        "TAHAKKUK",
        "BORC",
      ] as const)
      gonderim.push({
        id: `gn_${String(i + 1).padStart(3, "0")}`,
        kanal: eposta ? "EPOSTA" : "WHATSAPP",
        aliciTip: "MUKELLEF",
        aliciId: m.id,
        aliciAd: m.unvan,
        adres: adresMaskele(
          eposta ? "EPOSTA" : "WHATSAPP",
          eposta ? m.eposta : m.telefon
        ),
        konu:
          kaynak === "TALEP"
            ? "Evrak talebi"
            : kaynak === "TAHAKKUK"
              ? "Beyanname tahakkuku"
              : "Hizmet bedeli hatırlatması",
        ozet: `Merhaba ${m.unvan}, …`,
        // WhatsApp Business yapılandırılmadığı için WhatsApp gönderimleri wa.me ile elle yapıldı
        durum: hata ? "HATA" : eposta ? "GONDERILDI" : "ELLE",
        hataMesaji: hata ? "Alıcı sunucu iletiyi reddetti (550)" : undefined,
        kaynak,
        gonderenId: faker.helpers.arrayElement(personel).id,
        denemeSayisi: eposta || hata ? 1 : 0,
        zaman: zaman.toISOString(),
      })
    }
  }
  gonderim.sort((a, b) => b.zaman.localeCompare(a.zaman))
  return { kanal, bildirimTercihi, gonderim }
}
