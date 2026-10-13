import { useCallback, useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { TopluAktarim } from "@/features/ice-aktarim/components/toplu-aktarim"
import { useSifreTopluAktar } from "@/features/ice-aktarim/queries"
import {
  SIFRE_SUTUNLARI,
  sifreleriOku,
} from "@prime/shared/ice-aktarim/sifre-okuma"
import type { Hucre } from "@prime/shared/ice-aktarim/sutun-eslestir"
import { KasaDurumUyarisi } from "@/features/kasa/components/kasa-kilidi"
import { useCredentials } from "@/features/kasa/queries"
import { useKasaAcik, useVaultStore } from "@/features/kasa/store"
import { useMukellefList } from "@/features/mukellef/queries"
import { encryptJson } from "@/lib/crypto"

export function SifreAktarimPage() {
  const mukellefler = useMukellefList()
  const credentials = useCredentials()
  const kasaAcik = useKasaAcik()
  const aktar = useSifreTopluAktar()
  const [uzerineYaz, setUzerineYaz] = useState(false)

  const oku = useCallback(
    (satirlar: Hucre[][]) =>
      sifreleriOku(satirlar, {
        mukellefler: mukellefler.data?.items ?? [],
        mevcut: new Set(
          (credentials.data ?? []).map((c) => `${c.mukellefId}:${c.sistem}`)
        ),
        uzerineYaz,
      }),
    [mukellefler.data, credentials.data, uzerineYaz]
  )

  return (
    <>
      <KasaDurumUyarisi />
      <TopluAktarim
        baslik="Şifreleri kasaya aktar"
        aciklama="Mükellef başına bir satır; GİB, İnteraktif VD, SGK ve e-Bildirge bilgileri yan yana sütunlarda. Mükellefler VKN/TCKN veya unvanla eşleştirilir, bu yüzden önce mükellefleri aktarın. Şifreler tarayıcınızda kasa anahtarıyla şifrelenir; dosya ve düz şifreler sunucuya gönderilmez, önizlemede gösterilmez."
        sablon={{ dosyaAdi: "sifre-sablonu.xlsx", sutunlar: SIFRE_SUTUNLARI }}
        ayarlar={
          <Field orientation="horizontal" className="w-auto">
            <Checkbox
              id="sifre-uzerine-yaz"
              checked={uzerineYaz}
              onCheckedChange={setUzerineYaz}
            />
            <FieldLabel htmlFor="sifre-uzerine-yaz">
              Kasada kayıtlı şifrelerin üzerine yaz
            </FieldLabel>
          </Field>
        }
        oku={oku}
        hazir={Boolean(kasaAcik && mukellefler.data && credentials.data)}
        aktariliyor={aktar.isPending}
        aktar={async (kayitlar) => {
          const key = useVaultStore.getState().key
          if (!key) {
            useVaultStore.getState().requireKey()
            throw new Error("Kasa kilitlendi; kilidi açıp tekrar deneyin")
          }
          useVaultStore.getState().touch()
          return aktar.mutateAsync({
            uzerineYaz,
            kayitlar: await Promise.all(
              kayitlar.map(async ({ satir, veri }) => ({
                satir,
                mukellefId: veri.mukellefId,
                sistem: veri.sistem,
                kullaniciAdi: veri.kullaniciAdi,
                not: veri.not,
                ...(await encryptJson(veri.secret, key)),
              }))
            ),
          })
        }}
        sonNot={
          <p className="font-medium">
            Şifrelerin bulunduğu Excel dosyasını bilgisayarınızdan ve çöp
            kutusundan silin.
          </p>
        }
      />
    </>
  )
}
