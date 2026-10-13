import { useCallback, useState } from "react"
import { Link } from "react-router"

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { usePersonelList } from "@/features/auth/queries"
import { useAuthStore } from "@/features/auth/store"
import { TopluAktarim } from "@/features/ice-aktarim/components/toplu-aktarim"
import {
  MUKELLEF_SUTUNLARI,
  mukellefleriOku,
} from "@prime/shared/ice-aktarim/mukellef-okuma"
import { useMukellefTopluAktar } from "@/features/ice-aktarim/queries"
import type { Hucre } from "@prime/shared/ice-aktarim/sutun-eslestir"
import { PersonelSelect } from "@/features/mukellef/components/personel-select"
import { useMukellefList } from "@/features/mukellef/queries"

export function MukellefAktarimPage() {
  const user = useAuthStore((s) => s.user)
  const mukellefler = useMukellefList()
  const personel = usePersonelList()
  const aktar = useMukellefTopluAktar()
  const [sorumluId, setSorumluId] = useState(user?.id ?? "")

  const oku = useCallback(
    (satirlar: Hucre[][]) =>
      mukellefleriOku(satirlar, {
        mevcut: new Map(
          (mukellefler.data?.items ?? []).map((m) => [
            m.vkn ?? m.tckn ?? "",
            m.unvan,
          ])
        ),
        personel: personel.data ?? [],
        varsayilanSorumluId: sorumluId,
      }),
    [mukellefler.data, personel.data, sorumluId]
  )

  return (
    <TopluAktarim
      baslik="Mükellefleri içe aktar"
      aciklama={
        <>
          Önceki programınızdan veya Excel listenizden mükellefleri toplu
          ekleyin. Unvan, VKN/TCKN ve vergi dairesi zorunludur; eksik bilgileri
          sonra{" "}
          <Link to="/mukellefler" className="underline">
            mükellef kartından
          </Link>{" "}
          tamamlayabilirsiniz. Kayıtlı VKN/TCKN'ler atlanır.
        </>
      }
      sablon={{
        dosyaAdi: "mukellef-sablonu.xlsx",
        sutunlar: MUKELLEF_SUTUNLARI,
      }}
      ayarlar={
        <Field className="max-w-sm">
          <FieldLabel htmlFor="varsayilan-sorumlu">
            Varsayılan sorumlu
          </FieldLabel>
          <PersonelSelect
            id="varsayilan-sorumlu"
            value={sorumluId}
            onValueChange={(id) => id && setSorumluId(id)}
          />
          <FieldDescription>
            “Sorumlu” sütunu boş veya tanınmayan satırlara atanır.
          </FieldDescription>
        </Field>
      }
      oku={oku}
      hazir={Boolean(mukellefler.data && personel.data && sorumluId)}
      aktariliyor={aktar.isPending}
      aktar={(kayitlar) =>
        aktar.mutateAsync({
          kayitlar: kayitlar.map((k) => ({
            satir: k.satir,
            mukellef: k.veri,
          })),
        })
      }
    />
  )
}
