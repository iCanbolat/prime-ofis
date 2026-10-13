import { HttpResponse, http } from "msw"

import { db } from "@/mocks/db"
import {
  api,
  errorResponse,
  logActivity,
  notFound,
  requireActor,
} from "@/mocks/handlers/common"
import {
  SIFRE_MIN_UZUNLUK,
  sifreBelirle,
  sifreDogrula,
} from "@/mocks/personel-sifre"
import type {
  PersonelBilgi,
  PersonelGuncelleRequest,
  PersonelOlusturRequest,
  PersonelSifreRequest,
  YoneticiOnayi,
} from "@prime/shared/types/api"
import type { Personel, PersonelRenk, Rol } from "@prime/shared/types/domain"

const ROLLER: Rol[] = ["YONETICI", "PERSONEL"]
const RENKLER: PersonelRenk[] = ["blue", "emerald", "amber", "rose", "violet"]
const EPOSTA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Personel yönetimi: işlemi yapan yönetici olmalı ve her istekte kendi şifresini göndermeli
 * (oturum açık bırakılmış bir ekrandan kullanıcı eklenip şifre değiştirilemesin).
 */
async function yoneticiDogrula(
  request: Request,
  body: Partial<YoneticiOnayi>
): Promise<Personel | Response> {
  const actor = requireActor(request)
  if (actor instanceof Response) return actor
  if (actor.rol !== "YONETICI")
    return errorResponse(403, "Personeli yalnızca yönetici yönetebilir")
  if (!(await sifreDogrula(actor.id, body.yoneticiSifresi ?? "")))
    return errorResponse(403, "Yönetici şifresi hatalı")
  return actor
}

function sifreHatasi(sifre: unknown): string | null {
  if (typeof sifre !== "string" || sifre.length < SIFRE_MIN_UZUNLUK)
    return `Şifre en az ${SIFRE_MIN_UZUNLUK} karakter olmalı`
  if (sifre.length > 128) return "Şifre en fazla 128 karakter olabilir"
  return null
}

function bilgiOku(
  body: Partial<PersonelBilgi>,
  haricId?: string
): PersonelBilgi | Response {
  const ad = body.ad?.trim() ?? ""
  const soyad = body.soyad?.trim() ?? ""
  const eposta = body.eposta?.trim().toLowerCase() ?? ""
  const telefon = (body.telefon ?? "").replace(/\D/g, "")
  if (!ad || !soyad) return errorResponse(400, "Ad ve soyad zorunludur")
  if (!EPOSTA.test(eposta))
    return errorResponse(400, "Geçerli bir e-posta girin")
  if (telefon && telefon.length !== 11)
    return errorResponse(400, "Telefon 11 haneli olmalı (05XX…)")
  if (!body.rol || !ROLLER.includes(body.rol))
    return errorResponse(400, "Geçersiz rol")
  const cakisan = db.personel.where(
    (p) => p.id !== haricId && p.eposta.toLowerCase() === eposta
  )
  if (cakisan.length)
    return errorResponse(409, "Bu e-posta başka bir personelde kayıtlı")
  return {
    ad,
    soyad,
    eposta,
    telefon,
    rol: body.rol,
    renk: body.renk && RENKLER.includes(body.renk) ? body.renk : "blue",
    aktif: body.aktif ?? true,
  }
}

/** Değişiklik sonrası en az bir aktif yönetici kalmalı; yoksa büro yönetilemez hale gelir. */
const aktifYoneticiKalir = (haricId: string) =>
  db.personel.count(
    (p) => p.id !== haricId && p.aktif && p.rol === "YONETICI"
  ) > 0

const adSoyad = (p: Pick<Personel, "ad" | "soyad">) => `${p.ad} ${p.soyad}`

export const personelHandlers = [
  http.get(api("/personel"), () => HttpResponse.json(db.personel.all())),

  http.post<never, PersonelOlusturRequest>(
    api("/personel"),
    async ({ request }) => {
      const body = await request.json()
      const actor = await yoneticiDogrula(request, body)
      if (actor instanceof Response) return actor

      const bilgi = bilgiOku(body)
      if (bilgi instanceof Response) return bilgi
      const hata = sifreHatasi(body.sifre)
      if (hata) return errorResponse(400, hata)

      const personel = db.personel.insert(bilgi)
      await sifreBelirle(personel.id, body.sifre)
      logActivity(
        {
          aktorId: actor.id,
          eylem: "PERSONEL_EKLENDI",
          aciklama: adSoyad(personel),
        },
        false
      )
      return HttpResponse.json(personel, { status: 201 })
    }
  ),

  http.put<{ id: string }, PersonelGuncelleRequest>(
    api("/personel/:id"),
    async ({ request, params }) => {
      const body = await request.json()
      const actor = await yoneticiDogrula(request, body)
      if (actor instanceof Response) return actor

      const mevcut = db.personel.find(params.id)
      if (!mevcut) return notFound("Personel bulunamadı")
      const bilgi = bilgiOku(body, mevcut.id)
      if (bilgi instanceof Response) return bilgi

      const yoneticiliktenCikiyor =
        mevcut.rol === "YONETICI" &&
        mevcut.aktif &&
        (bilgi.rol !== "YONETICI" || !bilgi.aktif)
      if (yoneticiliktenCikiyor && !aktifYoneticiKalir(mevcut.id))
        return errorResponse(409, "Büroda en az bir aktif yönetici kalmalı")

      const guncel = db.personel.update(mevcut.id, bilgi)!
      logActivity(
        {
          aktorId: actor.id,
          eylem: "PERSONEL_GUNCELLENDI",
          aciklama: adSoyad(guncel),
        },
        false
      )
      return HttpResponse.json(guncel)
    }
  ),

  http.put<{ id: string }, PersonelSifreRequest>(
    api("/personel/:id/sifre"),
    async ({ request, params }) => {
      const body = await request.json()
      const actor = await yoneticiDogrula(request, body)
      if (actor instanceof Response) return actor

      const personel = db.personel.find(params.id)
      if (!personel) return notFound("Personel bulunamadı")
      const hata = sifreHatasi(body.sifre)
      if (hata) return errorResponse(400, hata)

      await sifreBelirle(personel.id, body.sifre)
      logActivity(
        {
          aktorId: actor.id,
          eylem: "PERSONEL_SIFRESI_DEGISTI",
          aciklama: adSoyad(personel),
        },
        false
      )
      return new HttpResponse(null, { status: 204 })
    }
  ),

  // Şifre gövdede gider: DELETE yerine POST (bazı proxy'ler DELETE gövdesini düşürür)
  http.post<{ id: string }, YoneticiOnayi>(
    api("/personel/:id/sil"),
    async ({ request, params }) => {
      const body = await request.json()
      const actor = await yoneticiDogrula(request, body)
      if (actor instanceof Response) return actor

      const personel = db.personel.find(params.id)
      if (!personel) return notFound("Personel bulunamadı")
      if (personel.id === actor.id)
        return errorResponse(409, "Kendi hesabınızı silemezsiniz")
      if (
        personel.rol === "YONETICI" &&
        personel.aktif &&
        !aktifYoneticiKalir(personel.id)
      )
        return errorResponse(409, "Büroda en az bir aktif yönetici kalmalı")

      // Açık iş bırakan personel silinmez; önce devredilmeli (veya pasife alınmalı)
      const mukellefSayisi = db.mukellef.count(
        (m) => m.sorumluPersonelId === personel.id
      )
      const gorevSayisi = db.gorev.count(
        (g) => g.atananId === personel.id && g.durum !== "TAMAM"
      )
      if (mukellefSayisi || gorevSayisi) {
        const parcalar = [
          mukellefSayisi && `${mukellefSayisi} mükellefin sorumlusu`,
          gorevSayisi && `${gorevSayisi} açık görevin atananı`,
        ].filter(Boolean)
        return errorResponse(
          409,
          `${adSoyad(personel)} ${parcalar.join(" ve ")}. Önce devredin veya personeli pasife alın.`
        )
      }

      db.personel.remove(personel.id)
      db.kimlik.remove(personel.id)
      db.bildirimTercihi.remove(personel.id)
      logActivity(
        {
          aktorId: actor.id,
          eylem: "PERSONEL_SILINDI",
          aciklama: adSoyad(personel),
        },
        false
      )
      return new HttpResponse(null, { status: 204 })
    }
  ),
]
