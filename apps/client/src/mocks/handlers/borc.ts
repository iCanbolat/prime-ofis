/**
 * Borç ve levha sorguları: `/api/borc`, `/api/vergi-levhasi`, `/api/borcu-yoktur`,
 * `/api/sgk-erisim`, `/api/kamu-dogrulama`. Gerçek backend GİB'e (e-Tebligat ile aynı İVD
 * erişimiyle) ve SGK İşveren Sistemi'ne `KamuSorguAdapter` ile bağlanır; burada mock adaptör
 * kullanılır. Gece sorgusu (03:00) geliştirmede `GET /borc/ozet` isteğinde işletilir (testte
 * kapalı; testler `kamuTaramasiCalistir`'ı doğrudan çağırır).
 *
 * Doğrulama ekranı otomatik geçilmez: giriş `DOGRULAMA` dönerse `KamuDogrulama` kaydı açılır,
 * istenen adımlar kayda yazılır ve personel kodu girene kadar o mükellef + kurum sorgulanmaz.
 */
import { addMinutes } from "date-fns"
import { HttpResponse, http } from "msw"

import type {
  KamuKimlik,
  KamuOturum,
  KamuSorguAdapter,
} from "@prime/shared/borc/kamu-adapter"
import {
  beklenenLevhaYili,
  borcToplami,
  borcuYokturAcikMi,
  borcuYokturGecerlilik,
  borcuYokturGorunum,
  kalemleriGoster,
  levhaGuncelMi,
} from "@prime/shared/borc/kurallar"
import {
  BORC_KURUM_BASLIK,
  DOGRULAMA_GECERLILIK_DK,
  KAMU_KURUM_ETIKET,
  SGK_KASA_SISTEMI,
} from "@prime/shared/borc/sabitler"
import { formatTRY } from "@prime/shared/lib/format"
import { bugun, toYmd } from "@prime/shared/lib/tarih"
import { putBlob } from "@/mocks/blob-store"
import { db } from "@/mocks/db"
import {
  api,
  errorResponse,
  logActivity,
  notFound,
  requireActor,
  turkishIncludes,
} from "@/mocks/handlers/common"
import { SISTEM_AKTOR } from "@/mocks/handlers/tahsilat"
import { sonGeceTaramaAni } from "@/mocks/handlers/tebligat"
import { mockKamuAdapter } from "@prime/mock-data/kamu/mock-adapter"
import type {
  BorcDetay,
  BorcKapsam,
  BorcListResponse,
  BorcOzetResponse,
  BorcSatiri,
  BorcuYokturIslemSonucu,
  BorcuYokturListResponse,
  BorcuYokturTalepRequest,
  BorcuYokturView,
  KamuDogrulamaCozRequest,
  KamuDogrulamaCozResponse,
  KamuDogrulamaView,
  KamuErisimDurumu,
  KamuIslemSonucu,
  KurumBorcOzeti,
  LevhaListResponse,
  LevhaSatiri,
  MukellefBorcResponse,
  SgkErisimKaydetRequest,
  SgkErisimSatiri,
  SgkErisimSatirDurumu,
} from "@prime/shared/types/api"
import type {
  ArsivKategori,
  BorcuYokturTalebi,
  KamuAdim,
  KamuDogrulama,
  KamuKurum,
  KamuTarama,
  Mukellef,
} from "@prime/shared/types/domain"

const KURUMLAR: KamuKurum[] = ["GIB", "SGK"]
const SAKLANAN_TARAMA = 30
const SGK_ERISIM_DURUMLARI: SgkErisimSatirDurumu[] = [
  "AKTIF",
  "HATA",
  "TANIMSIZ",
]

const kurumGecerli = (k: string | null | undefined): k is KamuKurum =>
  KURUMLAR.includes(k as KamuKurum)

/** SGK sorguları yalnızca SGK işyeri olan mükelleflerde yapılır */
const kurumUygulanir = (m: Mukellef, kurum: KamuKurum) =>
  kurum === "GIB" || m.sgkIsyeriVar

const vknOf = (m: Mukellef) => (m.vkn ?? m.tckn)!

function sayfala<T>(liste: T[], p: URLSearchParams, varsayilan = 20) {
  const sayfaBoyutu = Math.min(
    Math.max(Number(p.get("sayfaBoyutu")) || varsayilan, 1),
    100
  )
  const sonSayfa = Math.max(Math.ceil(liste.length / sayfaBoyutu), 1)
  const sayfa = Math.min(Math.max(Number(p.get("sayfa")) || 1, 1), sonSayfa)
  return {
    items: liste.slice((sayfa - 1) * sayfaBoyutu, sayfa * sayfaBoyutu),
    total: liste.length,
    sayfa,
    sayfaBoyutu,
  }
}

// --- Erişim ve oturum ------------------------------------------------------------------

const gibErisimBul = (mukellefId: string) =>
  db.tebligatErisim.where((e) => e.mukellefId === mukellefId)[0]
const sgkErisimBul = (mukellefId: string) =>
  db.sgkErisim.where((e) => e.mukellefId === mukellefId)[0]
const dogrulamaBul = (mukellefId: string, kurum: KamuKurum) =>
  db.kamuDogrulama.where(
    (d) => d.mukellefId === mukellefId && d.kurum === kurum
  )[0]

/**
 * Mock backend'de şifre saklanmaz. Hatalı erişim, personel şifreyi güncelleyene kadar başarısız
 * kalsın diye adaptöre "hatali" verilir.
 */
function kimlikBul(mukellefId: string, kurum: KamuKurum): KamuKimlik | null {
  if (kurum === "GIB") {
    const e = gibErisimBul(mukellefId)
    if (!e) return null
    return {
      kurum,
      kullaniciKodu: e.kullaniciKodu,
      sifre: e.durum === "HATA" ? "hatali" : "mock",
    }
  }
  const e = sgkErisimBul(mukellefId)
  if (!e) return null
  const sifre = e.durum === "HATA" ? "hatali" : "mock"
  return {
    kurum,
    kullaniciAdi: e.kullaniciAdi,
    isyeriKodu: e.isyeriKodu,
    sistemSifre: sifre,
    isyeriSifre: sifre,
  }
}

function erisimDurumu(mukellefId: string, kurum: KamuKurum): KamuErisimDurumu {
  if (dogrulamaBul(mukellefId, kurum)) return "DOGRULAMA"
  const e =
    kurum === "GIB" ? gibErisimBul(mukellefId) : sgkErisimBul(mukellefId)
  if (!e) return "TANIMSIZ"
  return e.durum
}

export function dogrulamaView(d: KamuDogrulama): KamuDogrulamaView {
  const { oturumId: _gizli, ...geri } = d
  return {
    ...geri,
    mukellefUnvan: db.mukellef.find(d.mukellefId)?.unvan ?? "",
    suresiDoldu: new Date(d.sonGecerlilik) < new Date(),
  }
}

/** Giriş başarısız: erişim HATA'ya düşer, ilk düşüşte mükellef sorumlusuna bildirim gider */
function erisimHatasi(
  m: Mukellef,
  kurum: KamuKurum,
  hataMesaji: string,
  aktorId: string
) {
  const e = kurum === "GIB" ? gibErisimBul(m.id) : sgkErisimBul(m.id)
  if (!e) return
  const ilkDusus = e.durum !== "HATA"
  if (kurum === "GIB")
    db.tebligatErisim.update(e.id, { durum: "HATA", hataMesaji })
  else db.sgkErisim.update(e.id, { durum: "HATA", hataMesaji })
  if (ilkDusus)
    logActivity(
      {
        aktorId,
        eylem: kurum === "GIB" ? "TEBLIGAT_ERISIM_HATASI" : "SGK_ERISIM_HATASI",
        hedefTip: "MUKELLEF",
        hedefId: m.id,
        mukellefId: m.id,
        aciklama: `${m.unvan} · ${hataMesaji}`,
      },
      {
        alicilar: [m.sorumluPersonelId],
        baslik: `${KAMU_KURUM_ETIKET[kurum]} girişi başarısız`,
      }
    )
}

function dogrulamaAc(
  m: Mukellef,
  kurum: KamuKurum,
  oturumId: string,
  gorselDataUrl: string,
  adimlar: KamuAdim[],
  aktorId: string,
  an: Date
): KamuDogrulama {
  const d = db.kamuDogrulama.insert({
    mukellefId: m.id,
    kurum,
    oturumId,
    gorselDataUrl,
    sonGecerlilik: addMinutes(an, DOGRULAMA_GECERLILIK_DK).toISOString(),
    bekleyenAdimlar: [...new Set(adimlar)],
    olusturmaTarihi: an.toISOString(),
  })
  logActivity(
    {
      aktorId,
      eylem: "KAMU_DOGRULAMA_BEKLIYOR",
      hedefTip: "BORC",
      hedefId: d.id,
      mukellefId: m.id,
      aciklama: `${m.unvan} · ${KAMU_KURUM_ETIKET[kurum]}`,
    },
    // Personel kendisi tetiklediyse kodu zaten ekranda görür
    aktorId === SISTEM_AKTOR
      ? {
          alicilar: [m.sorumluPersonelId],
          baslik: `${KAMU_KURUM_ETIKET[kurum]} doğrulama kodu bekleniyor`,
        }
      : false
  )
  return d
}

type OturumSonucu =
  { oturum: KamuOturum } | { dogrulama: KamuDogrulama } | { hata: string }

/**
 * Mükellef adına kuruma giriş yapar. Bekleyen doğrulama varsa yeniden denenmez; istenen adımlar
 * o kayda eklenir. Doğrulama ekranı çıkarsa kayıt açılır.
 */
async function oturumAc(
  m: Mukellef,
  kurum: KamuKurum,
  adimlar: KamuAdim[],
  aktorId: string,
  adapter: KamuSorguAdapter,
  an: Date
): Promise<OturumSonucu> {
  const kimlik = kimlikBul(m.id, kurum)
  if (!kimlik)
    return {
      hata:
        kurum === "GIB"
          ? "GİB erişimi tanımlı değil (e-Tebligat erişimi kullanılır)"
          : "SGK erişimi tanımlı değil",
    }
  const e = kurum === "GIB" ? gibErisimBul(m.id) : sgkErisimBul(m.id)
  if (e?.durum === "HATA")
    return {
      hata: e.hataMesaji ?? `${KAMU_KURUM_ETIKET[kurum]} girişi başarısız`,
    }

  const bekleyen = dogrulamaBul(m.id, kurum)
  if (bekleyen) {
    const birlesik = [...new Set([...bekleyen.bekleyenAdimlar, ...adimlar])]
    return {
      dogrulama:
        db.kamuDogrulama.update(bekleyen.id, { bekleyenAdimlar: birlesik }) ??
        bekleyen,
    }
  }

  const sonuc = await adapter.giris(kimlik)
  if (sonuc.durum === "HATA") {
    erisimHatasi(m, kurum, sonuc.hataMesaji, aktorId)
    return { hata: sonuc.hataMesaji }
  }
  if (sonuc.durum === "DOGRULAMA")
    return {
      dogrulama: dogrulamaAc(
        m,
        kurum,
        sonuc.oturumId,
        sonuc.gorselDataUrl,
        adimlar,
        aktorId,
        an
      ),
    }
  return { oturum: sonuc.oturum }
}

// --- Adımlar ---------------------------------------------------------------------------

async function arsiveKaydet(
  m: Mukellef,
  kategori: ArsivKategori,
  ad: string,
  pdfDataUrl: string,
  aktorId: string,
  an: Date,
  gecerlilikTarihi?: string
) {
  const kayit = db.arsiv.insert({
    mukellefId: m.id,
    kategori,
    ad,
    mimeType: "application/pdf",
    boyut: Math.round(((pdfDataUrl.length - pdfDataUrl.indexOf(",")) * 3) / 4),
    yukleyenId: aktorId,
    yuklemeTarihi: an.toISOString(),
    gecerlilikTarihi,
    silindi: false,
  })
  await putBlob(kayit.id, pdfDataUrl)
  return kayit.id
}

async function levhaAl(
  oturum: KamuOturum,
  m: Mukellef,
  aktorId: string,
  adapter: KamuSorguAdapter,
  an: Date
): Promise<string> {
  const yil = beklenenLevhaYili(toYmd(an))
  const levha = await adapter.vergiLevhasi(oturum, yil)
  if (!levha) return `${yil} vergi levhası GİB'de henüz yok`
  const mevcut = db.vergiLevhasi.where(
    (l) => l.mukellefId === m.id && l.yil === yil
  )[0]
  if (mevcut) {
    db.vergiLevhasi.update(mevcut.id, { sorguTarihi: an.toISOString() })
    return `${yil} vergi levhası zaten arşivde`
  }
  const arsivDosyaId = await arsiveKaydet(
    m,
    "VERGI_LEVHASI",
    `Vergi levhası ${yil}.pdf`,
    levha.pdfDataUrl,
    aktorId,
    an
  )
  const l = db.vergiLevhasi.insert({
    mukellefId: m.id,
    yil,
    vergiTuru: levha.vergiTuru,
    matrah: levha.matrah,
    onayKodu: levha.onayKodu,
    sorguTarihi: an.toISOString(),
    arsivDosyaId,
  })
  logActivity(
    {
      aktorId,
      eylem: "VERGI_LEVHASI_ALINDI",
      hedefTip: "ARSIV",
      hedefId: arsivDosyaId,
      mukellefId: m.id,
      aciklama: `${m.unvan} · ${l.yil}`,
    },
    false
  )
  return `${yil} vergi levhası alındı ve arşive kaydedildi`
}

async function borcSorgula(
  oturum: KamuOturum,
  m: Mukellef,
  kurum: KamuKurum,
  aktorId: string,
  adapter: KamuSorguAdapter,
  an: Date
): Promise<string> {
  const kalemler = await adapter.borclar(oturum)
  const id = `${m.id}:${kurum}`
  const bugunYmd = toYmd(an)
  const onceki = db.borcSorgusu.find(id)
  const oncekiVadesiGecmis = onceki
    ? borcToplami(onceki.kalemler, bugunYmd).vadesiGecmis
    : 0
  const kayit = {
    mukellefId: m.id,
    kurum,
    kalemler,
    sorguTarihi: an.toISOString(),
    sorgulayanId: aktorId,
  }
  if (onceki) db.borcSorgusu.update(id, kayit)
  else db.borcSorgusu.insert({ ...kayit, id })
  if (kurum === "SGK") {
    const e = sgkErisimBul(m.id)
    if (e) db.sgkErisim.update(e.id, { sonSorgu: an.toISOString() })
  }

  const t = borcToplami(kalemler, bugunYmd)
  if (aktorId !== SISTEM_AKTOR)
    logActivity(
      {
        aktorId,
        eylem: "BORC_SORGULANDI",
        hedefTip: "BORC",
        hedefId: id,
        mukellefId: m.id,
        aciklama: `${m.unvan} · ${BORC_KURUM_BASLIK[kurum]} · ${formatTRY(t.toplam)}`,
      },
      false
    )
  if (t.vadesiGecmis > 0 && oncekiVadesiGecmis === 0)
    logActivity(
      {
        aktorId,
        eylem: "BORC_TESPIT_EDILDI",
        hedefTip: "BORC",
        hedefId: id,
        mukellefId: m.id,
        aciklama: `${m.unvan} · ${formatTRY(t.vadesiGecmis)} vadesi geçmiş`,
      },
      {
        alicilar: [m.sorumluPersonelId],
        baslik: `Vadesi geçmiş ${BORC_KURUM_BASLIK[kurum].toLocaleLowerCase("tr-TR")}`,
      }
    )
  return t.toplam > 0
    ? `${BORC_KURUM_BASLIK[kurum]} sorgulandı: ${formatTRY(t.toplam)}`
    : `${BORC_KURUM_BASLIK[kurum]} sorgulandı: borç yok`
}

/** Gönderilmemiş talepleri gönderir, önceden gönderilmişlerin sonucunu sorar */
async function borcuYokturIsle(
  oturum: KamuOturum,
  m: Mukellef,
  kurum: KamuKurum,
  aktorId: string,
  adapter: KamuSorguAdapter,
  an: Date
): Promise<string[]> {
  const ozet: string[] = []
  const talepler = db.borcuYoktur.where(
    (t) => t.mukellefId === m.id && t.kurum === kurum && borcuYokturAcikMi(t)
  )
  for (const t of talepler) {
    if (t.durum === "DOGRULAMA_BEKLIYOR") {
      const { talepNo } = await adapter.borcuYokturTalep(oturum)
      db.borcuYoktur.update(t.id, { durum: "TALEP_EDILDI", talepNo })
      ozet.push(`${KAMU_KURUM_ETIKET[kurum]} borcu yoktur yazısı istendi`)
      continue
    }
    if (!t.talepNo) continue
    const sonuc = await adapter.borcuYokturSonuc(oturum, t.talepNo)
    if (sonuc.durum === "BEKLIYOR") continue
    const simdi = an.toISOString()
    if (sonuc.durum === "HAZIR") {
      const gecerlilikTarihi = borcuYokturGecerlilik(toYmd(an))
      const arsivDosyaId = await arsiveKaydet(
        m,
        kurum === "GIB" ? "BORCU_YOKTUR" : "SGK_BELGESI",
        `${KAMU_KURUM_ETIKET[kurum]} borcu yoktur yazısı ${toYmd(an)}.pdf`,
        sonuc.pdfDataUrl,
        aktorId,
        an,
        gecerlilikTarihi
      )
      db.borcuYoktur.update(t.id, {
        durum: "HAZIR",
        sonucTarihi: simdi,
        gecerlilikTarihi,
        arsivDosyaId,
      })
      ozet.push(`${KAMU_KURUM_ETIKET[kurum]} borcu yoktur yazısı hazır`)
    } else {
      db.borcuYoktur.update(t.id, {
        durum: "BORCU_VAR",
        sonucTarihi: simdi,
        aciklama: sonuc.aciklama,
      })
      ozet.push(`${KAMU_KURUM_ETIKET[kurum]} borcu yoktur yazısı verilmedi`)
    }
    logActivity(
      {
        aktorId,
        eylem: "BORCU_YOKTUR_SONUCLANDI",
        hedefTip: "BORC",
        hedefId: t.id,
        mukellefId: m.id,
        aciklama: `${m.unvan} · ${KAMU_KURUM_ETIKET[kurum]} · ${sonuc.durum === "HAZIR" ? "hazır" : sonuc.aciklama}`,
      },
      {
        alicilar: [t.talepEdenId],
        baslik:
          sonuc.durum === "HAZIR"
            ? "Borcu yoktur yazısı hazır"
            : "Borcu yoktur yazısı verilmedi",
      }
    )
  }
  return ozet
}

async function adimlariCalistir(
  oturum: KamuOturum,
  m: Mukellef,
  kurum: KamuKurum,
  adimlar: KamuAdim[],
  aktorId: string,
  adapter: KamuSorguAdapter,
  an: Date
): Promise<string[]> {
  const ozet: string[] = []
  for (const adim of new Set(adimlar)) {
    if (adim === "VERGI_LEVHASI" && kurum === "GIB")
      ozet.push(await levhaAl(oturum, m, aktorId, adapter, an))
    else if (adim === "BORC")
      ozet.push(await borcSorgula(oturum, m, kurum, aktorId, adapter, an))
    else if (adim === "BORCU_YOKTUR")
      ozet.push(
        ...(await borcuYokturIsle(oturum, m, kurum, aktorId, adapter, an))
      )
  }
  return ozet
}

/** Oturum açıp adımları çalıştırır; HTTP uçlarının ortak gövdesi */
async function sorgula(
  m: Mukellef,
  kurum: KamuKurum,
  adimlar: KamuAdim[],
  aktorId: string,
  adapter: KamuSorguAdapter = mockKamuAdapter(),
  an: Date = new Date()
): Promise<
  | { hata: string }
  | { dogrulama: KamuDogrulama; ozet?: undefined }
  | { dogrulama?: undefined; ozet: string[] }
> {
  const r = await oturumAc(m, kurum, adimlar, aktorId, adapter, an)
  if ("hata" in r) return r
  if ("dogrulama" in r) return { dogrulama: r.dogrulama }
  return {
    ozet: await adimlariCalistir(
      r.oturum,
      m,
      kurum,
      adimlar,
      aktorId,
      adapter,
      an
    ),
  }
}

// --- Gece sorgusu ----------------------------------------------------------------------

/**
 * Büro geneli gece sorgusu: GİB erişimi olan her aktif mükellefin borcu (ve levhası eksikse
 * levhası), SGK erişimi olanların prim borcu sorgulanır; bekleyen borcu yoktur talepleri
 * sonuçlandırılır. Doğrulama bekleyen ve girişi başarısız erişimler atlanır.
 */
export async function kamuTaramasiCalistir(
  an: Date,
  adapter: KamuSorguAdapter = mockKamuAdapter(() => an)
): Promise<KamuTarama> {
  let sorgulanan = 0
  let hatali = 0
  let dogrulama = 0
  const levhaOnce = db.vergiLevhasi.count()
  const bugunYmd = toYmd(an)
  for (const m of db.mukellef.where((m) => m.aktif)) {
    for (const kurum of KURUMLAR) {
      if (!kurumUygulanir(m, kurum)) continue
      if (erisimDurumu(m.id, kurum) === "TANIMSIZ") continue
      sorgulanan++
      if (dogrulamaBul(m.id, kurum)) {
        dogrulama++
        continue
      }
      const adimlar: KamuAdim[] = ["BORC"]
      if (
        kurum === "GIB" &&
        !levhaGuncelMi(
          db.vergiLevhasi.where((l) => l.mukellefId === m.id),
          bugunYmd
        )
      )
        adimlar.push("VERGI_LEVHASI")
      if (
        db.borcuYoktur.count(
          (t) =>
            t.mukellefId === m.id &&
            t.kurum === kurum &&
            t.durum === "TALEP_EDILDI"
        )
      )
        adimlar.push("BORCU_YOKTUR")
      const r = await sorgula(m, kurum, adimlar, SISTEM_AKTOR, adapter, an)
      if ("hata" in r) hatali++
      else if (r.dogrulama) dogrulama++
    }
  }
  const tarama = db.kamuTarama.insert({
    baslangic: an.toISOString(),
    bitis: addMinutes(
      an,
      Math.max(1, Math.ceil(sorgulanan / 10))
    ).toISOString(),
    sorgulanan,
    hatali,
    dogrulama,
    levha: db.vergiLevhasi.count() - levhaOnce,
  })
  const fazla = db.kamuTarama
    .all()
    .sort((a, b) => b.baslangic.localeCompare(a.baslangic))
    .slice(SAKLANAN_TARAMA)
  for (const t of fazla) db.kamuTarama.remove(t.id)
  return tarama
}

function sonTarama(): KamuTarama | null {
  return (
    db.kamuTarama
      .all()
      .sort((a, b) => b.baslangic.localeCompare(a.baslangic))[0] ?? null
  )
}

let calisanTarama: Promise<unknown> | null = null

/** Geliştirmede cron yerine: son gece sorgusu yapılmadıysa şimdi işletilir */
function kamuTaramasiGerekirse() {
  if (import.meta.env.MODE === "test") return Promise.resolve()
  if (calisanTarama) return calisanTarama
  const an = sonGeceTaramaAni()
  const son = sonTarama()
  if (son && new Date(son.baslangic) >= an) return Promise.resolve()
  calisanTarama = kamuTaramasiCalistir(an).finally(() => {
    calisanTarama = null
  })
  return calisanTarama
}

// --- Görünümler ------------------------------------------------------------------------

function borcSatiri(
  m: Mukellef,
  kurum: KamuKurum,
  bugunYmd: string
): BorcSatiri {
  const s = db.borcSorgusu.find(`${m.id}:${kurum}`)
  return {
    mukellefId: m.id,
    mukellefUnvan: m.unvan,
    vkn: vknOf(m),
    sorumluPersonelId: m.sorumluPersonelId,
    kurum,
    erisimDurumu: erisimDurumu(m.id, kurum),
    sorgu: s
      ? { ...borcToplami(s.kalemler, bugunYmd), sorguTarihi: s.sorguTarihi }
      : null,
  }
}

function borcDetay(m: Mukellef, kurum: KamuKurum): BorcDetay {
  const bugunYmd = bugun()
  const s = db.borcSorgusu.find(`${m.id}:${kurum}`)
  const d = dogrulamaBul(m.id, kurum)
  return {
    satir: borcSatiri(m, kurum, bugunYmd),
    kalemler: s
      ? kalemleriGoster(
          s.kalemler,
          db.tahakkuk.where((t) => t.mukellefId === m.id),
          bugunYmd
        )
      : [],
    dogrulama: d ? dogrulamaView(d) : null,
  }
}

function borcuYokturView(
  t: BorcuYokturTalebi,
  bugunYmd = bugun()
): BorcuYokturView {
  const p = db.personel.find(t.talepEdenId)
  return {
    ...t,
    mukellefUnvan: db.mukellef.find(t.mukellefId)?.unvan ?? "",
    talepEdenAd: p ? `${p.ad} ${p.soyad}` : undefined,
    gorunum: borcuYokturGorunum(t, bugunYmd),
  }
}

function levhaSatiri(m: Mukellef, bugunYmd: string): LevhaSatiri {
  const levhalar = db.vergiLevhasi
    .where((l) => l.mukellefId === m.id)
    .sort((a, b) => b.yil - a.yil)
  return {
    mukellefId: m.id,
    mukellefUnvan: m.unvan,
    vkn: vknOf(m),
    sorumluPersonelId: m.sorumluPersonelId,
    erisimDurumu: erisimDurumu(m.id, "GIB"),
    levha: levhalar[0] ?? null,
    guncel: levhaGuncelMi(levhalar, bugunYmd),
  }
}

function sgkErisimSatiri(m: Mukellef): SgkErisimSatiri {
  const e = sgkErisimBul(m.id)
  const kasa = db.credential.where(
    (c) => c.mukellefId === m.id && c.sistem === SGK_KASA_SISTEMI
  )[0]
  return {
    mukellefId: m.id,
    mukellefUnvan: m.unvan,
    vkn: vknOf(m),
    sorumluPersonelId: m.sorumluPersonelId,
    durum: e?.durum ?? "TANIMSIZ",
    erisim: e ?? null,
    kasaKaydiId: kasa?.id,
    kasaDahaYeni: Boolean(
      kasa &&
      e?.kasaKaynagi?.credentialId === kasa.id &&
      kasa.sonGuncelleme > e.kasaKaynagi.credentialGuncelleme
    ),
  }
}

const islemSonucu = (d: KamuDogrulama | undefined): KamuIslemSonucu => ({
  dogrulama: d ? dogrulamaView(d) : null,
})

const aramaUyar = (m: Mukellef, q: string) =>
  !q || turkishIncludes(m.unvan, q) || vknOf(m).includes(q)

// --- Handler'lar -----------------------------------------------------------------------

export const borcHandlers = [
  http.get(api("/borc/ozet"), async ({ request }) => {
    await kamuTaramasiGerekirse()
    const sorumlu = new URL(request.url).searchParams.get("sorumlu")
    const bugunYmd = bugun()
    const mukellefler = db.mukellef.where(
      (m) => m.aktif && (!sorumlu || m.sorumluPersonelId === sorumlu)
    )
    const kurumOzeti = (kurum: KamuKurum): KurumBorcOzeti => {
      const o = {
        vadesiGecmisMukellef: 0,
        vadesiGecmisToplam: 0,
        borcluMukellef: 0,
      }
      for (const m of mukellefler) {
        if (!kurumUygulanir(m, kurum)) continue
        const s = db.borcSorgusu.find(`${m.id}:${kurum}`)
        if (!s) continue
        const t = borcToplami(s.kalemler, bugunYmd)
        if (t.toplam > 0) o.borcluMukellef++
        if (t.vadesiGecmis > 0) {
          o.vadesiGecmisMukellef++
          o.vadesiGecmisToplam += t.vadesiGecmis
        }
      }
      o.vadesiGecmisToplam = Math.round(o.vadesiGecmisToplam * 100) / 100
      return o
    }
    const sgkErisim = { aktif: 0, hatali: 0, tanimsiz: 0 }
    let gibErisimSorunlu = 0
    for (const m of mukellefler) {
      const g = gibErisimBul(m.id)
      if (!g || g.durum === "HATA") gibErisimSorunlu++
      if (!m.sgkIsyeriVar) continue
      const e = sgkErisimBul(m.id)
      if (!e) sgkErisim.tanimsiz++
      else if (e.durum === "HATA") sgkErisim.hatali++
      else sgkErisim.aktif++
    }
    const ids = new Set(mukellefler.map((m) => m.id))
    const yanit: BorcOzetResponse = {
      gib: kurumOzeti("GIB"),
      sgk: kurumOzeti("SGK"),
      levhaEksik: mukellefler.filter(
        (m) =>
          !levhaGuncelMi(
            db.vergiLevhasi.where((l) => l.mukellefId === m.id),
            bugunYmd
          )
      ).length,
      dogrulamaBekleyen: db.kamuDogrulama.count((d) => ids.has(d.mukellefId)),
      borcuYokturBekleyen: db.borcuYoktur.count(
        (t) => ids.has(t.mukellefId) && borcuYokturAcikMi(t)
      ),
      sgkErisim,
      gibErisimSorunlu,
      sonTarama: sonTarama(),
    }
    return HttpResponse.json(yanit)
  }),

  http.get(api("/borc"), ({ request }) => {
    const p = new URL(request.url).searchParams
    const kurum = p.get("kurum")
    if (!kurumGecerli(kurum)) return errorResponse(400, "Geçersiz kurum")
    const q = p.get("q")?.trim() ?? ""
    const sorumlu = p.get("sorumlu")
    const kapsam = p.get("kapsam") as BorcKapsam | null
    const bugunYmd = bugun()
    const satirlar = db.mukellef
      .where(
        (m) =>
          m.aktif &&
          kurumUygulanir(m, kurum) &&
          (!sorumlu || m.sorumluPersonelId === sorumlu) &&
          aramaUyar(m, q)
      )
      .map((m) => borcSatiri(m, kurum, bugunYmd))
      .filter(
        (s) =>
          (kapsam !== "borclu" || (s.sorgu?.toplam ?? 0) > 0) &&
          (kapsam !== "vadesiGecmis" || (s.sorgu?.vadesiGecmis ?? 0) > 0) &&
          (kapsam !== "sorgulanmadi" || !s.sorgu)
      )
      .sort(
        (a, b) =>
          (b.sorgu?.vadesiGecmis ?? 0) - (a.sorgu?.vadesiGecmis ?? 0) ||
          (b.sorgu?.toplam ?? 0) - (a.sorgu?.toplam ?? 0) ||
          a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr")
      )
    const yanit: BorcListResponse = sayfala(satirlar, p)
    return HttpResponse.json(yanit)
  }),

  http.get<{ mukellefId: string; kurum: string }>(
    api("/borc/:mukellefId/:kurum"),
    ({ params }) => {
      const m = db.mukellef.find(params.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      if (!kurumGecerli(params.kurum))
        return errorResponse(400, "Geçersiz kurum")
      if (!kurumUygulanir(m, params.kurum))
        return errorResponse(409, "Mükellefin SGK işyeri kaydı yok")
      return HttpResponse.json(borcDetay(m, params.kurum))
    }
  ),

  http.post<{ mukellefId: string; kurum: string }>(
    api("/borc/:mukellefId/:kurum/sorgula"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const m = db.mukellef.find(params.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      const kurum = params.kurum
      if (!kurumGecerli(kurum)) return errorResponse(400, "Geçersiz kurum")
      if (!kurumUygulanir(m, kurum))
        return errorResponse(409, "Mükellefin SGK işyeri kaydı yok")
      const r = await sorgula(m, kurum, ["BORC"], actor.id)
      if ("hata" in r) return errorResponse(409, r.hata)
      return HttpResponse.json(islemSonucu(r.dogrulama))
    }
  ),

  http.get<{ id: string }>(api("/mukellefler/:id/borc"), ({ params }) => {
    const m = db.mukellef.find(params.id)
    if (!m) return notFound("Mükellef bulunamadı")
    const bugunYmd = bugun()
    const yanit: MukellefBorcResponse = {
      gib: borcDetay(m, "GIB"),
      sgk: m.sgkIsyeriVar ? borcDetay(m, "SGK") : null,
      levhalar: db.vergiLevhasi
        .where((l) => l.mukellefId === m.id)
        .sort((a, b) => b.yil - a.yil),
      borcuYoktur: db.borcuYoktur
        .where((t) => t.mukellefId === m.id)
        .sort((a, b) => b.talepTarihi.localeCompare(a.talepTarihi))
        .map((t) => borcuYokturView(t, bugunYmd)),
    }
    return HttpResponse.json(yanit)
  }),

  // --- Vergi levhası ---

  http.get(api("/vergi-levhasi"), ({ request }) => {
    const p = new URL(request.url).searchParams
    const q = p.get("q")?.trim() ?? ""
    const sorumlu = p.get("sorumlu")
    const kapsam = p.get("kapsam")
    const bugunYmd = bugun()
    const satirlar = db.mukellef
      .where(
        (m) =>
          m.aktif &&
          (!sorumlu || m.sorumluPersonelId === sorumlu) &&
          aramaUyar(m, q)
      )
      .map((m) => levhaSatiri(m, bugunYmd))
      .filter(
        (s) =>
          (kapsam !== "eksik" || !s.guncel) && (kapsam !== "guncel" || s.guncel)
      )
      .sort(
        (a, b) =>
          Number(a.guncel) - Number(b.guncel) ||
          a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr")
      )
    const yanit: LevhaListResponse = {
      ...sayfala(satirlar, p),
      beklenenYil: beklenenLevhaYili(bugunYmd),
    }
    return HttpResponse.json(yanit)
  }),

  http.post<{ mukellefId: string }>(
    api("/vergi-levhasi/:mukellefId/sorgula"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const m = db.mukellef.find(params.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      const r = await sorgula(m, "GIB", ["VERGI_LEVHASI"], actor.id)
      if ("hata" in r) return errorResponse(409, r.hata)
      return HttpResponse.json(islemSonucu(r.dogrulama))
    }
  ),

  // --- Borcu yoktur yazısı ---

  http.get(api("/borcu-yoktur"), ({ request }) => {
    const p = new URL(request.url).searchParams
    const kurum = p.get("kurum")
    const mukellefId = p.get("mukellefId")
    const kapsam = p.get("kapsam")
    const bugunYmd = bugun()
    const liste = db.borcuYoktur
      .all()
      .filter(
        (t) =>
          (!kurumGecerli(kurum) || t.kurum === kurum) &&
          (!mukellefId || t.mukellefId === mukellefId)
      )
      .map((t) => borcuYokturView(t, bugunYmd))
      .filter(
        (t) =>
          (kapsam !== "bekleyen" || borcuYokturAcikMi(t)) &&
          (kapsam !== "hazir" || t.gorunum === "HAZIR") &&
          (kapsam !== "sonuclanan" || !borcuYokturAcikMi(t))
      )
      .sort((a, b) => b.talepTarihi.localeCompare(a.talepTarihi))
    const yanit: BorcuYokturListResponse = sayfala(liste, p)
    return HttpResponse.json(yanit)
  }),

  http.post<never, BorcuYokturTalepRequest>(
    api("/borcu-yoktur"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const body = await request.json()
      if (!kurumGecerli(body.kurum)) return errorResponse(400, "Geçersiz kurum")
      const m = db.mukellef.find(body.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      if (!m.aktif) return errorResponse(409, "Mükellef pasif")
      if (!kurumUygulanir(m, body.kurum))
        return errorResponse(409, "Mükellefin SGK işyeri kaydı yok")
      if (
        db.borcuYoktur.count(
          (t) =>
            t.mukellefId === m.id &&
            t.kurum === body.kurum &&
            borcuYokturAcikMi(t)
        )
      )
        return errorResponse(
          409,
          "Bu kurumda sonuçlanmamış bir borcu yoktur talebi var"
        )

      const adapter = mockKamuAdapter()
      const an = new Date()
      const r = await oturumAc(
        m,
        body.kurum,
        ["BORCU_YOKTUR"],
        actor.id,
        adapter,
        an
      )
      if ("hata" in r) return errorResponse(409, r.hata)
      const talep = db.borcuYoktur.insert({
        mukellefId: m.id,
        kurum: body.kurum,
        durum: "DOGRULAMA_BEKLIYOR",
        talepEdenId: actor.id,
        talepTarihi: an.toISOString(),
      })
      if ("oturum" in r)
        await adimlariCalistir(
          r.oturum,
          m,
          body.kurum,
          ["BORCU_YOKTUR"],
          actor.id,
          adapter,
          an
        )
      logActivity(
        {
          aktorId: actor.id,
          eylem: "BORCU_YOKTUR_TALEP_EDILDI",
          hedefTip: "BORC",
          hedefId: talep.id,
          mukellefId: m.id,
          aciklama: `${m.unvan} · ${KAMU_KURUM_ETIKET[body.kurum]}`,
        },
        false
      )
      const yanit: BorcuYokturIslemSonucu = {
        talep: borcuYokturView(db.borcuYoktur.find(talep.id)!),
        ...islemSonucu("dogrulama" in r ? r.dogrulama : undefined),
      }
      return HttpResponse.json(yanit, { status: 201 })
    }
  ),

  /** Gece beklemeden yazının hazır olup olmadığını sorar */
  http.post<{ id: string }>(
    api("/borcu-yoktur/:id/kontrol"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const t = db.borcuYoktur.find(params.id)
      if (!t) return notFound("Talep bulunamadı")
      if (!borcuYokturAcikMi(t))
        return errorResponse(409, "Talep zaten sonuçlandı")
      const m = db.mukellef.find(t.mukellefId)!
      const r = await sorgula(m, t.kurum, ["BORCU_YOKTUR"], actor.id)
      if ("hata" in r) return errorResponse(409, r.hata)
      const yanit: BorcuYokturIslemSonucu = {
        talep: borcuYokturView(db.borcuYoktur.find(t.id)!),
        ...islemSonucu(r.dogrulama),
      }
      return HttpResponse.json(yanit)
    }
  ),

  // --- SGK erişimi ---

  http.get(api("/sgk-erisim"), ({ request }) => {
    const durumParam = new URL(request.url).searchParams.get(
      "durum"
    ) as SgkErisimSatirDurumu | null
    const durum =
      durumParam && SGK_ERISIM_DURUMLARI.includes(durumParam)
        ? durumParam
        : null
    const satirlar = db.mukellef
      .where((m) => m.aktif && m.sgkIsyeriVar)
      .map(sgkErisimSatiri)
      .filter((s) => !durum || s.durum === durum)
      .sort(
        (a, b) =>
          SGK_ERISIM_DURUMLARI.indexOf(b.durum) -
            SGK_ERISIM_DURUMLARI.indexOf(a.durum) ||
          a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr")
      )
    return HttpResponse.json(satirlar)
  }),

  http.get<{ mukellefId: string }>(
    api("/sgk-erisim/:mukellefId"),
    ({ params }) => {
      const m = db.mukellef.find(params.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      return HttpResponse.json(sgkErisimSatiri(m))
    }
  ),

  http.put<{ mukellefId: string }, SgkErisimKaydetRequest>(
    api("/sgk-erisim/:mukellefId"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const m = db.mukellef.find(params.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      if (!m.sgkIsyeriVar)
        return errorResponse(409, "Mükellefin SGK işyeri kaydı yok")
      const body = await request.json()
      const kullaniciAdi = body.kullaniciAdi?.trim() ?? ""
      const isyeriKodu = body.isyeriKodu?.trim() ?? ""
      if (kullaniciAdi.length < 2 || kullaniciAdi.length > 40)
        return errorResponse(400, "Kullanıcı adı 2–40 karakter olmalı")
      if (!/^\d{1,10}$/.test(isyeriKodu))
        return errorResponse(400, "İşyeri kodu 1–10 haneli olmalı")
      if (!body.sistemSifre || body.sistemSifre.length < 4)
        return errorResponse(400, "Sistem şifresi en az 4 karakter olmalı")
      if (!body.isyeriSifre || body.isyeriSifre.length < 4)
        return errorResponse(400, "İşyeri şifresi en az 4 karakter olmalı")
      const kasa = body.kasaCredentialId
        ? db.credential.find(body.kasaCredentialId)
        : undefined
      if (
        body.kasaCredentialId &&
        (kasa?.mukellefId !== m.id || kasa.sistem !== SGK_KASA_SISTEMI)
      )
        return errorResponse(400, "Kasa kaydı bu mükellefin SGK kaydı değil")
      const sonuc = await mockKamuAdapter().giris({
        kurum: "SGK",
        kullaniciAdi,
        isyeriKodu,
        sistemSifre: body.sistemSifre,
        isyeriSifre: body.isyeriSifre,
      })
      // Doğrulama ekranı çıkması şifrenin yanlış olduğu anlamına gelmez; ilk sorguda çözülür
      if (sonuc.durum === "HATA") return errorResponse(422, sonuc.hataMesaji)

      const kayit = {
        kullaniciAdi,
        isyeriKodu,
        sistemSifreIpucu: body.sistemSifre.slice(-4),
        isyeriSifreIpucu: body.isyeriSifre.slice(-4),
        durum: "AKTIF" as const,
        hataMesaji: undefined,
        kasaKaynagi: kasa
          ? { credentialId: kasa.id, credentialGuncelleme: kasa.sonGuncelleme }
          : undefined,
        tanimlayanId: actor.id,
        tanimlamaTarihi: new Date().toISOString(),
      }
      const mevcut = sgkErisimBul(m.id)
      if (mevcut) db.sgkErisim.update(mevcut.id, kayit)
      else db.sgkErisim.insert({ ...kayit, mukellefId: m.id })
      // Şifre değişince eski doğrulama oturumu geçersizdir
      const bekleyen = dogrulamaBul(m.id, "SGK")
      if (bekleyen) db.kamuDogrulama.remove(bekleyen.id)
      logActivity(
        {
          aktorId: actor.id,
          eylem: "SGK_ERISIMI_TANIMLANDI",
          hedefTip: "MUKELLEF",
          hedefId: m.id,
          mukellefId: m.id,
          aciklama: kasa ? `${m.unvan} · kasadaki SGK kaydından` : m.unvan,
        },
        false
      )
      if (kasa)
        logActivity(
          {
            aktorId: actor.id,
            eylem: "SIFRE_SGK_SORGUSUNA_AKTARILDI",
            hedefTip: "CREDENTIAL",
            hedefId: kasa.id,
            mukellefId: m.id,
            aciklama: kasa.sistem,
          },
          false
        )
      return HttpResponse.json(sgkErisimSatiri(m))
    }
  ),

  http.delete<{ mukellefId: string }>(
    api("/sgk-erisim/:mukellefId"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const m = db.mukellef.find(params.mukellefId)
      const e = m && sgkErisimBul(m.id)
      if (!m || !e) return notFound("SGK erişimi tanımlı değil")
      db.sgkErisim.remove(e.id)
      const bekleyen = dogrulamaBul(m.id, "SGK")
      if (bekleyen) db.kamuDogrulama.remove(bekleyen.id)
      logActivity(
        {
          aktorId: actor.id,
          eylem: "SGK_ERISIMI_KALDIRILDI",
          hedefTip: "MUKELLEF",
          hedefId: m.id,
          mukellefId: m.id,
          aciklama: m.unvan,
        },
        false
      )
      return new HttpResponse(null, { status: 204 })
    }
  ),

  // --- Doğrulama ekranları ---

  http.get(api("/kamu-dogrulama"), ({ request }) => {
    const mukellefId = new URL(request.url).searchParams.get("mukellefId")
    const liste = db.kamuDogrulama
      .where((d) => !mukellefId || d.mukellefId === mukellefId)
      .sort((a, b) => a.olusturmaTarihi.localeCompare(b.olusturmaTarihi))
      .map(dogrulamaView)
    return HttpResponse.json(liste)
  }),

  http.post<{ id: string }, KamuDogrulamaCozRequest>(
    api("/kamu-dogrulama/:id"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const d = db.kamuDogrulama.find(params.id)
      if (!d) return notFound("Doğrulama bulunamadı ya da zaten çözüldü")
      const body = await request.json()
      const kod = body.kod?.trim() ?? ""
      if (!kod || kod.length > 12)
        return errorResponse(400, "Görseldeki kodu girin")
      if (new Date(d.sonGecerlilik) < new Date())
        return errorResponse(410, "Görselin süresi doldu; yeni görsel isteyin")
      const m = db.mukellef.find(d.mukellefId)!
      const kimlik = kimlikBul(m.id, d.kurum)
      if (!kimlik) {
        db.kamuDogrulama.remove(d.id)
        return errorResponse(409, "Erişim kaldırılmış")
      }
      const adapter = mockKamuAdapter()
      const an = new Date()
      const sonuc = await adapter.giris(kimlik, { oturumId: d.oturumId, kod })
      if (sonuc.durum === "HATA") {
        db.kamuDogrulama.remove(d.id)
        erisimHatasi(m, d.kurum, sonuc.hataMesaji, actor.id)
        return errorResponse(409, sonuc.hataMesaji)
      }
      if (sonuc.durum === "DOGRULAMA") {
        db.kamuDogrulama.update(d.id, {
          oturumId: sonuc.oturumId,
          gorselDataUrl: sonuc.gorselDataUrl,
          sonGecerlilik: addMinutes(an, DOGRULAMA_GECERLILIK_DK).toISOString(),
        })
        return errorResponse(422, "Kod hatalı; yeni görseldeki kodu girin")
      }
      db.kamuDogrulama.remove(d.id)
      const ozet = await adimlariCalistir(
        sonuc.oturum,
        m,
        d.kurum,
        d.bekleyenAdimlar,
        actor.id,
        adapter,
        an
      )
      logActivity(
        {
          aktorId: actor.id,
          eylem: "KAMU_DOGRULAMA_TAMAMLANDI",
          hedefTip: "BORC",
          hedefId: d.id,
          mukellefId: m.id,
          aciklama: `${m.unvan} · ${KAMU_KURUM_ETIKET[d.kurum]}`,
        },
        false
      )
      const yanit: KamuDogrulamaCozResponse = { ozet }
      return HttpResponse.json(yanit)
    }
  ),

  http.post<{ id: string }>(
    api("/kamu-dogrulama/:id/yenile"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const d = db.kamuDogrulama.find(params.id)
      if (!d) return notFound("Doğrulama bulunamadı ya da zaten çözüldü")
      const kimlik = kimlikBul(d.mukellefId, d.kurum)
      if (!kimlik) {
        db.kamuDogrulama.remove(d.id)
        return errorResponse(409, "Erişim kaldırılmış")
      }
      const yeni = await mockKamuAdapter().dogrulamaYenile(kimlik)
      const guncel = db.kamuDogrulama.update(d.id, {
        ...yeni,
        sonGecerlilik: addMinutes(
          new Date(),
          DOGRULAMA_GECERLILIK_DK
        ).toISOString(),
      })!
      return HttpResponse.json(dogrulamaView(guncel))
    }
  ),
]
