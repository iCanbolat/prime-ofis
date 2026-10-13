import { useCallback, useState } from "react"
import { LockPasswordIcon } from "@hugeicons/core-free-icons"

import { EmptyState } from "@/components/shared/query-states"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { useAuthStore } from "@/features/auth/store"
import {
  BAKIYE_SUTUNLARI,
  bakiyeleriOku,
} from "@prime/shared/ice-aktarim/bakiye-okuma"
import { TopluAktarim } from "@/features/ice-aktarim/components/toplu-aktarim"
import { useAcilisTopluAktar } from "@/features/ice-aktarim/queries"
import type { Hucre } from "@prime/shared/ice-aktarim/sutun-eslestir"
import { useMukellefList } from "@/features/mukellef/queries"
import { bugun } from "@prime/shared/lib/tarih"

export function BakiyeAktarimPage() {
  const yonetici = useAuthStore((s) => s.user?.rol === "YONETICI")
  const mukellefler = useMukellefList()
  const aktar = useAcilisTopluAktar()
  const [uzerineYaz, setUzerineYaz] = useState(false)

  const oku = useCallback(
    (satirlar: Hucre[][]) =>
      bakiyeleriOku(satirlar, {
        mukellefler: mukellefler.data?.items ?? [],
        bugun: bugun(),
        uzerineYaz,
      }),
    [mukellefler.data, uzerineYaz]
  )

  if (!yonetici)
    return (
      <EmptyState
        icon={LockPasswordIcon}
        title="Yalnızca yönetici"
        description="Ücret ve açılış bakiyelerini büro yöneticisi aktarabilir."
      />
    )

  return (
    <TopluAktarim
      baslik="Ücret ve açılış bakiyelerini aktar"
      aciklama="Her mükellefin aylık hizmet bedelini ve bugünkü borç bakiyesini toplu tanımlayın; önce mükellefleri aktarın. Açılış bakiyesi cari hesaba tek bir “Açılış bakiyesi” kaydı olarak yazılır ve tekrar aktarımda değişmez. Aylık ücret borçları, başlangıç dönemi boşsa bakiye tarihinden sonraki aydan başlar; böylece aynı ay iki kez borçlandırılmaz."
      sablon={{
        dosyaAdi: "ucret-bakiye-sablonu.xlsx",
        sutunlar: BAKIYE_SUTUNLARI,
      }}
      ayarlar={
        <Field orientation="horizontal" className="w-auto">
          <Checkbox
            id="ucret-uzerine-yaz"
            checked={uzerineYaz}
            onCheckedChange={setUzerineYaz}
          />
          <FieldLabel htmlFor="ucret-uzerine-yaz">
            Tanımlı aylık ücretlerin üzerine yaz
          </FieldLabel>
        </Field>
      }
      oku={oku}
      hazir={Boolean(mukellefler.data)}
      aktariliyor={aktar.isPending}
      aktar={(kayitlar) =>
        aktar.mutateAsync({
          uzerineYaz,
          kayitlar: kayitlar.map(({ satir, veri }) => ({ satir, ...veri })),
        })
      }
    />
  )
}
