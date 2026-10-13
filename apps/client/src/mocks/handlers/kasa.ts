import { HttpResponse, http } from "msw"

import { db } from "@/mocks/db"
import {
  api,
  errorResponse,
  logActivity,
  notFound,
  requireActor,
} from "@/mocks/handlers/common"
import { ensureVault } from "@/mocks/vault"
import type {
  CredentialCreateRequest,
  CredentialErisimRequest,
  CredentialKaydi,
  CredentialTopluRequest,
  CredentialUpdateRequest,
  KasaMetaResponse,
  SonErisim,
  TopluAktarimSonucu,
} from "@prime/shared/types/api"
import type { Credential, Sistem } from "@prime/shared/types/domain"

const SISTEMLER: Sistem[] = ["GIB", "SGK", "IVD", "EBILDIRGE"]
const ERISIM_EYLEMLERI: CredentialErisimRequest["eylem"][] = [
  "SIFRE_GORUNTULENDI",
  "SIFRE_KOPYALANDI",
]
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

function sonErisim(credentialId: string): SonErisim | null {
  const last = db.aktivite
    .where(
      (a) =>
        a.hedefId === credentialId &&
        (a.eylem === "SIFRE_GORUNTULENDI" ||
          a.eylem === "SIFRE_KOPYALANDI" ||
          a.eylem === "SIFRE_TEBLIGATA_AKTARILDI")
    )
    .sort((a, b) => b.zaman.localeCompare(a.zaman))[0]
  if (!last) return null
  const p = db.personel.find(last.aktorId)
  return {
    eylem: last.eylem,
    zaman: last.zaman,
    aktorAdi: p ? `${p.ad} ${p.soyad}` : "Bilinmiyor",
  }
}

const toKaydi = (c: Credential): CredentialKaydi => ({
  ...c,
  sonErisim: sonErisim(c.id),
})

/** Sunucu yalnızca şifreli veri kabul eder: düz metin gönderimini engellemek için biçim kontrolü. */
function isEncryptedPayload(body: { cipherText?: unknown; iv?: unknown }) {
  return (
    typeof body.cipherText === "string" &&
    typeof body.iv === "string" &&
    BASE64.test(body.cipherText) &&
    BASE64.test(body.iv)
  )
}

export const kasaHandlers = [
  http.get(api("/kasa/meta"), async () => {
    await ensureVault()
    const [meta] = db.kasa.all()
    return HttpResponse.json<KasaMetaResponse>({
      salt: meta.salt,
      iterations: meta.iterations,
      verifier: meta.verifier,
    })
  }),

  http.get(api("/kasa/credentials"), async ({ request }) => {
    await ensureVault()
    const mukellefId = new URL(request.url).searchParams.get("mukellefId")
    const items = db.credential
      .where((c) => !mukellefId || c.mukellefId === mukellefId)
      .map(toKaydi)
    return HttpResponse.json(items)
  }),

  http.post<never, CredentialCreateRequest>(
    api("/kasa/credentials"),
    async ({ request }) => {
      await ensureVault()
      const actor = requireActor(request)
      if (actor instanceof Response) return actor

      const body = await request.json()
      if (!db.mukellef.find(body.mukellefId))
        return notFound("Mükellef bulunamadı")
      if (!SISTEMLER.includes(body.sistem))
        return errorResponse(400, "Geçersiz sistem")
      if (!body.kullaniciAdi?.trim())
        return errorResponse(400, "Kullanıcı adı zorunludur")
      if (!isEncryptedPayload(body))
        return errorResponse(400, "Şifre şifrelenmiş olarak gönderilmelidir")
      if (
        db.credential.count(
          (c) => c.mukellefId === body.mukellefId && c.sistem === body.sistem
        ) > 0
      ) {
        return errorResponse(409, "Bu sistem için zaten kayıtlı bir şifre var")
      }

      const created = db.credential.insert({
        mukellefId: body.mukellefId,
        sistem: body.sistem,
        kullaniciAdi: body.kullaniciAdi.trim(),
        cipherText: body.cipherText,
        iv: body.iv,
        not: body.not?.trim() || undefined,
        sonGuncelleme: new Date().toISOString(),
        guncelleyenId: actor.id,
      })
      logActivity({
        aktorId: actor.id,
        eylem: "SIFRE_EKLENDI",
        hedefTip: "CREDENTIAL",
        hedefId: created.id,
        mukellefId: created.mukellefId,
        aciklama: created.sistem,
      })
      return HttpResponse.json(toKaydi(created), { status: 201 })
    }
  ),

  /**
   * Hızlı başlangıç: Excel'den şifreler. İstemci her kaydı kasa anahtarıyla şifreler; sunucu
   * yalnızca şifreli veriyi alır. Mevcut kayıt `uzerineYaz` ile güncellenir, yoksa atlanır.
   */
  http.post<never, CredentialTopluRequest>(
    api("/kasa/credentials/toplu"),
    async ({ request }) => {
      await ensureVault()
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const { uzerineYaz, kayitlar } = await request.json()
      if (!Array.isArray(kayitlar) || kayitlar.length === 0)
        return errorResponse(400, "Aktarılacak kayıt yok")

      const sonuc: TopluAktarimSonucu = {
        olusturulan: 0,
        guncellenen: 0,
        atlanan: 0,
        hatalar: [],
      }
      const zaman = new Date().toISOString()
      for (const k of kayitlar) {
        const hata = !db.mukellef.find(k.mukellefId)
          ? "Mükellef bulunamadı"
          : !SISTEMLER.includes(k.sistem)
            ? "Geçersiz sistem"
            : !k.kullaniciAdi?.trim()
              ? "Kullanıcı adı zorunludur"
              : !isEncryptedPayload(k)
                ? "Şifre şifrelenmiş olarak gönderilmelidir"
                : null
        if (hata) {
          sonuc.hatalar.push({ satir: k.satir, mesaj: hata })
          continue
        }
        const alanlar = {
          kullaniciAdi: k.kullaniciAdi.trim(),
          cipherText: k.cipherText,
          iv: k.iv,
          not: k.not?.trim() || undefined,
          sonGuncelleme: zaman,
          guncelleyenId: actor.id,
        }
        const mevcut = db.credential.where(
          (c) => c.mukellefId === k.mukellefId && c.sistem === k.sistem
        )[0]
        if (mevcut && !uzerineYaz) {
          sonuc.atlanan++
          continue
        }
        const kayit = mevcut
          ? db.credential.update(mevcut.id, alanlar)!
          : db.credential.insert({
              mukellefId: k.mukellefId,
              sistem: k.sistem,
              ...alanlar,
            })
        logActivity(
          {
            aktorId: actor.id,
            eylem: mevcut ? "SIFRE_GUNCELLENDI" : "SIFRE_EKLENDI",
            hedefTip: "CREDENTIAL",
            hedefId: kayit.id,
            mukellefId: kayit.mukellefId,
            aciklama: `${kayit.sistem} (içe aktarım)`,
          },
          false
        )
        if (mevcut) sonuc.guncellenen++
        else sonuc.olusturulan++
      }
      return HttpResponse.json(sonuc)
    }
  ),

  http.put<{ id: string }, CredentialUpdateRequest>(
    api("/kasa/credentials/:id"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const existing = db.credential.find(params.id)
      if (!existing) return notFound("Şifre kaydı bulunamadı")

      const body = await request.json()
      if (!body.kullaniciAdi?.trim())
        return errorResponse(400, "Kullanıcı adı zorunludur")
      if (!isEncryptedPayload(body))
        return errorResponse(400, "Şifre şifrelenmiş olarak gönderilmelidir")

      const updated = db.credential.update(params.id, {
        kullaniciAdi: body.kullaniciAdi.trim(),
        cipherText: body.cipherText,
        iv: body.iv,
        not: body.not?.trim() || undefined,
        sonGuncelleme: new Date().toISOString(),
        guncelleyenId: actor.id,
      })!
      logActivity({
        aktorId: actor.id,
        eylem: "SIFRE_GUNCELLENDI",
        hedefTip: "CREDENTIAL",
        hedefId: updated.id,
        mukellefId: updated.mukellefId,
        aciklama: updated.sistem,
      })
      return HttpResponse.json(toKaydi(updated))
    }
  ),

  http.delete<{ id: string }>(
    api("/kasa/credentials/:id"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const existing = db.credential.find(params.id)
      if (!existing) return notFound("Şifre kaydı bulunamadı")

      db.credential.remove(params.id)
      logActivity({
        aktorId: actor.id,
        eylem: "SIFRE_SILINDI",
        hedefTip: "CREDENTIAL",
        hedefId: existing.id,
        mukellefId: existing.mukellefId,
        aciklama: existing.sistem,
      })
      return new HttpResponse(null, { status: 204 })
    }
  ),

  http.post<{ id: string }, CredentialErisimRequest>(
    api("/kasa/credentials/:id/erisim"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const credential = db.credential.find(params.id)
      if (!credential) return notFound("Şifre kaydı bulunamadı")

      const { eylem } = await request.json()
      if (!ERISIM_EYLEMLERI.includes(eylem))
        return errorResponse(400, "Geçersiz erişim türü")

      logActivity({
        aktorId: actor.id,
        eylem,
        hedefTip: "CREDENTIAL",
        hedefId: credential.id,
        mukellefId: credential.mukellefId,
        aciklama: credential.sistem,
      })
      return HttpResponse.json({ sonErisim: sonErisim(credential.id) })
    }
  ),
]
