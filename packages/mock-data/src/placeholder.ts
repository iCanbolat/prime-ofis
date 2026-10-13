/**
 * Seed dosyalarının içeriği saklanmaz; önizleme istendiğinde dosya adını gösteren
 * küçük bir placeholder (SVG görsel veya tek sayfalık PDF) üretilir.
 */
import type { ArsivDosya } from "@prime/shared/types/domain"

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function svgPlaceholder(ad: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520"><rect width="800" height="520" fill="#eef0e6"/><rect x="40" y="40" width="720" height="440" rx="24" fill="#ffffff" stroke="#c9ccb8" stroke-width="2"/><circle cx="160" cy="200" r="70" fill="#dfe3d0"/><rect x="270" y="150" width="400" height="22" rx="11" fill="#dfe3d0"/><rect x="270" y="195" width="320" height="22" rx="11" fill="#dfe3d0"/><rect x="270" y="240" width="360" height="22" rx="11" fill="#dfe3d0"/><text x="400" y="400" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#555a45">${escapeXml(ad)}</text><text x="400" y="440" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#8a8f78">Örnek (mock) görsel</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** PDF standart fontları Türkçe karakter desteklemediği için ASCII'ye indirgenir. */
function ascii(value: string) {
  const map: Record<string, string> = {
    ç: "c",
    Ç: "C",
    ğ: "g",
    Ğ: "G",
    ı: "i",
    İ: "I",
    ö: "o",
    Ö: "O",
    ş: "s",
    Ş: "S",
    ü: "u",
    Ü: "U",
  }
  return value
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => map[c] ?? c)
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[()\\]/g, "")
}

function pdfPlaceholder(ad: string): string {
  const icerik = `BT /F1 24 Tf 72 720 Td (${ascii(ad)}) Tj ET BT /F1 12 Tf 72 690 Td (Prime Ofis - ornek mock belge) Tj ET`
  const nesneler = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${icerik.length} >>\nstream\n${icerik}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  let pdf = "%PDF-1.4\n"
  const ofsetler: number[] = []
  nesneler.forEach((n, i) => {
    ofsetler.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${n}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${nesneler.length + 1}\n0000000000 65535 f \n`
  pdf += ofsetler
    .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
    .join("")
  pdf += `trailer\n<< /Size ${nesneler.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return `data:application/pdf;base64,${btoa(pdf)}`
}

export function placeholderIcerik(dosya: Pick<ArsivDosya, "ad" | "mimeType">) {
  return dosya.mimeType === "application/pdf"
    ? pdfPlaceholder(dosya.ad)
    : svgPlaceholder(dosya.ad)
}
