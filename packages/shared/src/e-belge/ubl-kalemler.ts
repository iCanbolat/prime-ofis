/**
 * UBL-TR fatura XML'inden kalemler. Portal kalemleri ayrı ekranda vermediği için detay, faturanın
 * XML'inden okunur. Bağımlılıksız ve saf (client + api): yalnızca ihtiyaç duyulan alanlar, ad
 * alanı önekinden bağımsız okunur.
 */
import type { EBelgeKalem } from "../types/api"

/** UN/ECE Rec 20 birim kodları → ekranda gösterilen ad */
export const UBL_BIRIMLERI: Record<string, string> = {
  C62: "Adet",
  NIU: "Adet",
  HUR: "Saat",
  DAY: "Gün",
  MON: "Ay",
  ANN: "Yıl",
  KGM: "Kg",
  GRM: "Gram",
  LTR: "Litre",
  MTR: "Metre",
  MTK: "m²",
  MTQ: "m³",
  KWH: "kWh",
  SET: "Set",
  PA: "Paket",
  BX: "Kutu",
}

/** Birim adından UBL koduna (mock XML üretimi için); bilinmeyen ad C62 */
export function ublBirimKodu(birim: string): string {
  if (birim === "Sefer") return "C62"
  return (
    Object.entries(UBL_BIRIMLERI).find(([, ad]) => ad === birim)?.[0] ?? "C62"
  )
}

const ONEK = String.raw`(?:[A-Za-z][\w.-]*:)?`

/** İlk `<önek:etiket …>içerik</önek:etiket>` eşleşmesi (iç içe aynı etiket yok varsayılır) */
function eleman(
  xml: string,
  etiket: string
): { attr: string; icerik: string } | undefined {
  const re = new RegExp(
    String.raw`<${ONEK}${etiket}(\s[^>]*)?>([\s\S]*?)</${ONEK}${etiket}>`
  )
  const m = re.exec(xml)
  return m ? { attr: m[1] ?? "", icerik: m[2] ?? "" } : undefined
}

function hepsi(xml: string, etiket: string): string[] {
  const re = new RegExp(
    String.raw`<${ONEK}${etiket}(?:\s[^>]*)?>([\s\S]*?)</${ONEK}${etiket}>`,
    "g"
  )
  return [...xml.matchAll(re)].map((m) => m[1] ?? "")
}

const VARLIKLAR: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
}

function metin(s: string | undefined): string {
  return (s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (tam, v: string) => {
      if (v[0] === "#") {
        const kod =
          v[1]?.toLowerCase() === "x"
            ? parseInt(v.slice(2), 16)
            : Number(v.slice(1))
        return Number.isFinite(kod) ? String.fromCodePoint(kod) : tam
      }
      return VARLIKLAR[v] ?? tam
    })
    .trim()
}

const sayi = (s: string | undefined) => {
  const n = Number(metin(s))
  return Number.isFinite(n) ? n : 0
}

/** `data:…;base64,` URL'si ya da düz XML metni */
export function ublMetni(xmlVeyaDataUrl: string): string {
  if (!xmlVeyaDataUrl.startsWith("data:")) return xmlVeyaDataUrl
  const virgul = xmlVeyaDataUrl.indexOf(",")
  const govde = xmlVeyaDataUrl.slice(virgul + 1)
  if (!xmlVeyaDataUrl.slice(0, virgul).endsWith(";base64"))
    return decodeURIComponent(govde)
  const ikili = atob(govde)
  return new TextDecoder().decode(
    Uint8Array.from(ikili, (c) => c.charCodeAt(0))
  )
}

export function ublKalemleri(xmlVeyaDataUrl: string): EBelgeKalem[] {
  const xml = ublMetni(xmlVeyaDataUrl)
  return hepsi(xml, "InvoiceLine").map((satir, i): EBelgeKalem => {
    const miktar = eleman(satir, "InvoicedQuantity")
    const birimKodu =
      /unitCode\s*=\s*"([^"]*)"/.exec(miktar?.attr ?? "")?.[1] ?? ""
    const vergi = eleman(satir, "TaxTotal")?.icerik ?? ""
    // KDV alt toplamı (TaxTypeCode 0015); yoksa ilk alt toplam
    const altlar = hepsi(vergi, "TaxSubtotal")
    const kdv =
      altlar.find((a) => metin(eleman(a, "TaxTypeCode")?.icerik) === "0015") ??
      altlar[0]
    const item = eleman(satir, "Item")?.icerik ?? ""
    return {
      sira: Number(metin(eleman(satir, "ID")?.icerik)) || i + 1,
      ad:
        metin(eleman(item, "Name")?.icerik) ||
        metin(eleman(item, "Description")?.icerik),
      miktar: sayi(miktar?.icerik),
      birim: UBL_BIRIMLERI[birimKodu] ?? birimKodu,
      birimFiyat: sayi(
        eleman(eleman(satir, "Price")?.icerik ?? "", "PriceAmount")?.icerik
      ),
      kdvOrani: kdv ? sayi(eleman(kdv, "Percent")?.icerik) : 0,
      tutar: sayi(eleman(satir, "LineExtensionAmount")?.icerik),
    }
  })
}
